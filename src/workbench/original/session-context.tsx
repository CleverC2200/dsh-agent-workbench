import React, { createContext, useContext } from 'react';

export interface WorkbenchSession {
  conversationId: string | null;
  startAnalysis?: () => void;
  preparingAnalysis?: boolean;
}

const WorkbenchSessionContext = createContext<WorkbenchSession>({ conversationId: null });

export function WorkbenchSessionProvider({
  value,
  children,
}: React.PropsWithChildren<{ value: WorkbenchSession }>) {
  return (
    <WorkbenchSessionContext.Provider value={value}>{children}</WorkbenchSessionContext.Provider>
  );
}

export function useBusinessSurfaceSession(): WorkbenchSession {
  return useContext(WorkbenchSessionContext);
}
