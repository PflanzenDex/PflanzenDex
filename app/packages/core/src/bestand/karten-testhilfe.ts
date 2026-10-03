import type {
  BehandlungsQuelle,
  MessungsAnsicht,
  MessungsQuelle,
  OffeneBehandlung,
} from "./karten-typen";

type Aufruf = { nutzerId: string; ids: readonly string[] };
const auswahl = <T>(daten: Readonly<Record<string, T>>, ids: readonly string[]) =>
  new Map(ids.flatMap((id) => (daten[id] ? [[id, daten[id]] as const] : [])));

/** Messungen-Stub (nur Tests): merkt sich, wen der Port gefragt wurde. */
export class MessungenStub implements MessungsQuelle {
  readonly aufrufe: Aufruf[] = [];
  constructor(private readonly daten: Readonly<Record<string, MessungsAnsicht>>) {}

  async fuer(nutzerId: string, ids: readonly string[]) {
    this.aufrufe.push({ nutzerId, ids });
    return auswahl(this.daten, ids);
  }
}

/** Behandlungen-Stub (nur Tests): merkt sich, wen der Port gefragt wurde. */
export class BehandlungenStub implements BehandlungsQuelle {
  readonly aufrufe: Aufruf[] = [];
  constructor(private readonly daten: Readonly<Record<string, readonly OffeneBehandlung[]>>) {}

  async offene(nutzerId: string, ids: readonly string[]) {
    this.aufrufe.push({ nutzerId, ids });
    return auswahl(this.daten, ids);
  }
}
