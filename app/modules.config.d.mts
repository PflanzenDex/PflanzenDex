export type ModuleEntry = {
  name: string;
  epics: string[];
  tables: string[];
  dependsOn: string[];
  ports: string[];
};
export type GlobalReferenceTable = { owner: string; reason: string };
export type ModuleConfig = {
  MODULES: ModuleEntry[];
  LEGACY_MIGRATIONS: Record<string, string[]>;
  UNMODULED_FOLDERS: Record<string, string>;
  MODULE_FOLDERS_IN_TRANSITION: Record<string, string>;
  GLOBAL_REFERENCE_TABLES: Record<string, GlobalReferenceTable>;
  KERNEL: string;
};
export const MODULE_CONFIG: ModuleConfig;
