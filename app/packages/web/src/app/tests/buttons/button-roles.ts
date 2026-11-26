// The helpers moved to `shared/ui/button.roles.ts` (issue 2206): the tests of the feature modules read the roles of
// their buttons too, and a module cannot import from `app` (AB-15). This line keeps the imports of the tests in this folder.
export * from "@/shared/ui/button.roles";
