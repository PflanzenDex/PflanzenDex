import { useMemo } from "react";
import { createPortal } from "react-dom";
import { labelAddress, qrModules } from "../label-code";
import { cn } from "@/shared/lib/utils";
import { QrCode } from "../qr-code/qr-code";

/** A4 sheet of 70 x 37 mm labels, three in a row; the single format is one 62 mm label per page (US-BES-17, starting values, assumption). */
export type LabelFormat = "sheet" | "single";

/** What a label prints: the plant's name, its cultivar when the species has one, and the plant's id for the address. */
export type LabelPlant = { id: string; name: string; cultivar: string | null };

// Tailwind reads class names as literals, so the sizes are written out here, not built from variables.
const LABEL: Record<LabelFormat, string> = {
  sheet: "h-[37mm] w-[70mm]",
  single: "h-[37mm] w-[62mm] [&:not(:last-child)]:break-after-page",
};

/** One label: the QR code of the address on the left, the name and the cultivar on the right (US-BES-17). */
function PotLabel(props: { plant: LabelPlant; format: LabelFormat; origin: string }) {
  const { plant, format, origin } = props;
  const modules = useMemo(() => qrModules(labelAddress(origin, plant.id)), [origin, plant.id]);
  return (
    <article
      data-format={format}
      className={cn(
        "flex items-center gap-[2mm] overflow-hidden bg-white p-[2mm] text-black",
        LABEL[format],
      )}
    >
      <QrCode modules={modules} className="size-[30mm] shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-semibold leading-tight">{plant.name}</p>
        {plant.cultivar ? (
          <p className="break-words text-xs leading-tight">{`'${plant.cultivar}'`}</p>
        ) : null}
      </div>
    </article>
  );
}

/** The labels of the chosen plants in the chosen format; the sheet is a grid of three columns (US-BES-17). */
export function LabelSheet(props: {
  plants: readonly LabelPlant[];
  format: LabelFormat;
  origin: string;
}) {
  const { plants, format, origin } = props;
  return (
    <div className={format === "sheet" ? "grid w-[210mm] grid-cols-3" : "block"}>
      {plants.map((plant) => (
        <PotLabel key={plant.id} plant={plant} format={format} origin={origin} />
      ))}
    </div>
  );
}

/**
 * The labels in the print-only region at the end of the body (US-BES-17): hidden on screen, shown in print; the shell is
 * hidden in print as well, so only the labels reach the paper.
 */
export function PrintRegion(props: {
  label: string;
  plants: readonly LabelPlant[];
  format: LabelFormat;
}) {
  const { label, plants, format } = props;
  return createPortal(
    <section aria-label={label} data-format={format} className="hidden print:block">
      <LabelSheet plants={plants} format={format} origin={window.location.origin} />
    </section>,
    document.body,
  );
}
