import { draft } from "./domain";

export function DraftPaper({
  version,
  active,
  typoFixed,
  caption,
}: {
  version: "v1" | "v2";
  active: string[];
  typoFixed?: boolean;
  caption?: string;
}) {
  const body = version === "v1" ? draft.versions.v1 : draft.versions.v2;
  return (
    <article className="paper">
      <div className="org">{draft.org}文件</div>
      <div className="redline" />
      <div className="row" style={{ justifyContent: "space-between", color: "#475569" }}>
        <span>稿件 {draft.id}</span>
        <span>{version}</span>
        <span>{caption ?? (version === "v1" ? "原文" : "修订快照，不继承 v1")}</span>
      </div>
      <h3>{draft.title}</h3>
      <p className="to">{draft.recipient}</p>
      {body.paragraphs.map((paragraph) => (
        <p key={paragraph.no}>
          {paragraph.parts.map((part, index) =>
            part.anchor ? (
              <mark
                key={`${part.anchor}-${index}`}
                data-anchor={part.anchor}
                className={`hl${active.includes(part.anchor) ? " on" : ""}`}
              >
                {part.anchor === "typo" && typoFixed ? "协调" : part.text}
              </mark>
            ) : (
              <span key={index}>{part.text}</span>
            ),
          )}
        </p>
      ))}
      <div data-anchor="sign" className={`sign${active.includes("sign") ? " on" : ""}`}>
        <div>
          <div>{draft.org}</div>
          {version === "v1" ? <div className="missing">成文日期：未填写</div> : <div>2026年11月6日</div>}
        </div>
      </div>
    </article>
  );
}
