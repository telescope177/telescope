import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { basis as bundledBasis, knowledge as bundledKnowledge, type BasisRow, type KnowledgeDoc } from "./domain";

interface LiveBasis {
  knowledge: KnowledgeDoc[];
  basis: BasisRow[];
  reload: () => void;
}

const Ctx = createContext<LiveBasis>({
  knowledge: bundledKnowledge,
  basis: bundledBasis,
  reload: () => undefined,
});

export function LiveBasisProvider({ children }: { children: ReactNode }) {
  const [knowledge, setKnowledge] = useState(bundledKnowledge);
  const [basis, setBasis] = useState(bundledBasis);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let stop = false;
    fetch("/api/basis")
      .then((response) => response.json())
      .then((body) => {
        if (stop || !body.ok) return;
        if (Array.isArray(body.knowledge) && body.knowledge.length) setKnowledge(body.knowledge);
        if (Array.isArray(body.basis)) setBasis(body.basis);
      })
      .catch(() => undefined);
    return () => { stop = true; };
  }, [tick]);
  return <Ctx.Provider value={{ knowledge, basis, reload: () => setTick((value) => value + 1) }}>{children}</Ctx.Provider>;
}

export function useLiveBasis() {
  return useContext(Ctx);
}
