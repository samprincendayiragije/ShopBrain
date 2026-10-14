import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Admin from "@/pages/admin";
import TrustPage from "./pages/Trustpage";
import { PrivacyPage } from "@/pages/Legal";

import { FxHost } from "@/fx/FxHost";
import { FxPanel, DashIntro } from "@/fx/FxUI";

const queryClient = new QueryClient();

// 3D scroll animation for the whole page, plus the dashboard-only intro and animation settings.
function FxShell() {
  const [loc] = useLocation();
  const admin = loc.startsWith("/admin");
  return (
    <>
      <FxHost admin={admin} path={loc} />
      {admin && (
        <>
          <DashIntro />
          <FxPanel />
        </>
      )}
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/trust" component={TrustPage} />
      <Route path="/admin" component={Admin} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
          <FxShell />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
