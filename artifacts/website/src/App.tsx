import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import About from "@/pages/About";
import Features from "@/pages/Features";
import Pricing from "@/pages/Pricing";
import Contact from "@/pages/Contact";
import Admin from "@/pages/admin";
import TrustPage from "./pages/Trustpage";
import { Privacy, Terms } from "@/pages/Legal";

import { FxHost } from "@/fx/FxHost";
import { FxPanel, DashIntro } from "@/fx/FxUI";

const queryClient = new QueryClient();

// The public site is plain and static. The 3D scroll animation and the intro
// only run on the admin dashboard.
function FxShell() {
  const [loc] = useLocation();
  const admin = loc.startsWith("/admin");
  return (
    <>
      {admin && <FxHost admin={admin} path={loc} />}
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
      <Route path="/about" component={About} />
      <Route path="/features" component={Features} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/contact" component={Contact} />
      <Route path="/trust" component={TrustPage} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/admin" component={Admin} />
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