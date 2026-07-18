import { NextResponse } from 'next/server'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { createExpense, queryExpenses, ExpenseValidationError } from '@/lib/expenses/store'

export async function GET() {
  try {
    const user = await requireCapability('accounting.expense.view')
    const expenses = await queryExpenses(user)
    return NextResponse.json(expenses)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('accounting.expense.create')
    const body = await request.json()

    let result
    try {
      result = await createExpense(user, {
        date: body.date,
        category: body.category,
        amount: body.amount,
        description: body.description,
        branchId: body.branchId,
      })
    } catch (err) {
      if (err instanceof ExpenseValidationError) return NextResponse.json({ error: err.message }, { status: 400 })
      throw err
    }

    await writeAuditLog({
      action: 'expense_create',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: result.id,
      branchId: result.payload.branchId as string,
      details: result.payload,
    })

    return NextResponse.json({ id: result.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
