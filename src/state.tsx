import React, { useContext, useState } from "react";

import { Block } from "./lib/river";

const ComponentContext = React.createContext<{
  components: Block[];
  setComponents: (b: Block[]) => void;
}>({ components: [], setComponents: (_: Block[]) => { } });

// Component provider
export const ComponentProvider = ({ children }: React.PropsWithChildren) => {
  const [components, setComponents] = useState<Block[]>([]);
  // Remember to pass the state and the updater function to the provider
  return (
    <ComponentContext.Provider value={{ components, setComponents }}>
      {children}
    </ComponentContext.Provider>
  );
};

export function useComponentContext() {
  const context = useContext(ComponentContext);
  if (!context) {
    throw new Error(
      "useComponentContext must be used within the ComponentProvider"
    );
  }
  return context;
}