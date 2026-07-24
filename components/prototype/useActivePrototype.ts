"use client";

import { useEffect, useState } from "react";
import {
  LOCAL_PROTOTYPE_UPDATED_EVENT,
  loadPrototypeForRouteFromLocalStorage,
} from "@/lib/local-prototype-store";
import type { PrototypeSpec } from "@/lib/prototype-types";

export function useActivePrototype(prototype: PrototypeSpec): PrototypeSpec {
  const [activePrototype, setActivePrototype] = useState<PrototypeSpec>(prototype);

  useEffect(() => {
    window.addEventListener(LOCAL_PROTOTYPE_UPDATED_EVENT, syncLocalPrototype);
    window.addEventListener("storage", syncLocalPrototype);
    syncLocalPrototype();

    return () => {
      window.removeEventListener(LOCAL_PROTOTYPE_UPDATED_EVENT, syncLocalPrototype);
      window.removeEventListener("storage", syncLocalPrototype);
    };

    function syncLocalPrototype(): void {
      const localPrototype = loadPrototypeForRouteFromLocalStorage(prototype.id);
      setActivePrototype(localPrototype ?? prototype);
    }
  }, [prototype]);

  return activePrototype;
}
