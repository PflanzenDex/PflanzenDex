// The names of the hook records added in round 2 of issue 2554 (US-QG-07). The draft folder is no place where a record name
// can be written: the record-name guard of rules.mjs refuses such text outside .claude/hooks/. The owner's copy sets the
// names below; the code and the tests use these constants, so they work with any name that matches the record pattern.
export const KEY_FILE = "claude-gate-key";
export const FINGERPRINT_FILE = "claude-gate-fingerprint.json";
