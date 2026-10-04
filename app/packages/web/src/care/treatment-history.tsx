import type { TreatableSpecimen } from "./treatments-api";

type Token = () => Promise<string | undefined>;

/** Skeleton (red): the done treatments per specimen (US-BEH-03). */
export function TreatmentHistory(props: {
  api: string;
  token: Token;
  specimens: readonly TreatableSpecimen[];
  version: number;
}) {
  void props;
  return (
    <section aria-labelledby="treatment-history-title">
      <h2 id="treatment-history-title">Erledigte Behandlungen</h2>
    </section>
  );
}
