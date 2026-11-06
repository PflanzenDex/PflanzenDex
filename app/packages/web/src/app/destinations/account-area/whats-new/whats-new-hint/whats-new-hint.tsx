import { useState } from "react";
import { Link } from "react-router";
import { texts } from "@/shared/lib/text-rules/texts";
import { accountAddress } from "@/shared/patterns/navigation/navigation/navigation";
import { Banner } from "@/shared/patterns/states/banner/banner";
import table from "../whats-new.de.json";
import { NEWS_LINES, appVersion, markNewsSeen, unseenNow } from "../whats-new";

const t = texts(table);

/**
 * The one-time hint on "Heute" after an update (US-DEV-06): it names the lines this device has not seen and links to the
 * page "Neu in PflanzenDéx". It stays until it is dismissed or the page was opened, and a first visit shows nothing. It is
 * the shared banner (DS-34), so it is announced as a status and can be closed by keyboard.
 */
export function WhatsNewHint() {
  const total = NEWS_LINES.length;
  const [unseen, setUnseen] = useState(() => unseenNow(total));
  if (unseen === 0) return null;
  const version = appVersion() ?? t("version.unknown");
  const title =
    unseen === 1 ? t("hint.one", { version }) : t("hint.many", { version, count: unseen });
  return (
    <Banner
      variant="info"
      title={title}
      dismissLabel={t("hint.dismiss")}
      onDismiss={() => {
        markNewsSeen(total);
        setUnseen(0);
      }}
      className="mb-3"
    >
      <Link to={accountAddress("news")} className="underline">
        {t("hint.link")}
      </Link>
    </Banner>
  );
}
