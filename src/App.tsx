import { LiveBasisProvider } from "./live-basis";
import { AnalysisPage } from "./pages/Analysis";
import { AdminPage } from "./pages/Admin";
import { ConsultPage } from "./pages/Consult";
import { DraftPage } from "./pages/Draft";
import { IntakePage } from "./pages/Intake";
import { LoginPage } from "./pages/Login";
import { ReviewPage } from "./pages/Review";
import { SearchPage } from "./pages/Search";
import { Shell } from "./shell";
import { StoreProvider, useStore } from "./state";

function Pages() {
  const { state } = useStore();
  if (!state.user) {
    return (
      <>
        <LoginPage />
        {state.toast ? <div className="toast">{state.toast}</div> : null}
      </>
    );
  }
  return (
    <Shell>
      {state.page === "admin" ? <AdminPage /> : null}
      {state.page === "intake" ? <IntakePage /> : null}
      {state.page === "search" ? <SearchPage /> : null}
      {state.page === "draft" ? <DraftPage /> : null}
      {state.page === "review" ? <ReviewPage /> : null}
      {state.page === "analysis" ? <AnalysisPage /> : null}
      {state.page === "consult" ? <ConsultPage /> : null}
      {state.toast ? <div className="toast">{state.toast}</div> : null}
    </Shell>
  );
}

export function App() {
  return (
    <StoreProvider>
      <LiveBasisProvider>
        <Pages />
      </LiveBasisProvider>
    </StoreProvider>
  );
}
