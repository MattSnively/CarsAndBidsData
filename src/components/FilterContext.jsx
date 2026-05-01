import { createContext, useContext, useState, useMemo, useCallback } from "react";
import { initialFilters } from "../tokens.js";

const FilterContext = createContext({
  filters: initialFilters,
  setFilters: () => {},
  reset: () => {},
});

export function FilterProvider({ children }) {
  const [filters, setFilters] = useState(initialFilters);
  const reset = useCallback(() => setFilters(initialFilters), []);
  const value = useMemo(
    () => ({ filters, setFilters, reset }),
    [filters, reset],
  );
  return (
    <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
  );
}

export const useFilters = () => useContext(FilterContext);
