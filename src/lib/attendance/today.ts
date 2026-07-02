// TEMPORARY: UTC calendar date, not branch-local time. There is no per-branch
// timezone concept in this app yet (see CLAUDE.md's "HR — leave & attendance"
// section and the still-open jurisdiction decision). Every attendance
// check-in/check-out/roster route calls this one function so there is exactly
// one place to fix when branch timezones become real.
export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}
