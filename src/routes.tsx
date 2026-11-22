import { Navigate, Route, Routes } from "react-router-dom"
import App from "./App"
import { Shell } from "./components/Shell"
import { JobPlayground } from "./pages/JobPlayground"
import { Commitments } from "./pages/Commitments"
import { Landing } from "./pages/Landing"
import { PublicPage } from "./pages/PublicPage"
import { Playground } from "./pages/Playground"
import { WorkWithUs } from "./pages/WorkWithUs"
import { AccessPending, Login } from "./pages/Auth"
import { surface } from "./surface"
import { TierProvider } from "./lib/useTier"
import type { WorkflowId } from "./lib/workflows"
import { CompanyHome, McpLanding, Products } from "./pages/Umbrella"

function Mvp() {
  return <App />
}

export function AppRoutes() {
  // One auth owner for the whole route tree, so logout gates every mounted flow at once.
  return <TierProvider><Routes>
    <Route path="/" element={surface.id === "lawyerlab" ? <CompanyHome /> : <Navigate to={surface.home} replace />} />
    <Route path="/products/" element={<Products />} />
    <Route path="/products/mcp/" element={<McpLanding />} />
    <Route path="/mcp/" element={<Navigate to="/products/mcp/" replace />} />
    {surface.id === "lawyerlab" && <>
      <Route path="/about/" element={<PublicPage page="about" />} />
      <Route path="/example/" element={<PublicPage page="example" />} />
      <Route path="/faq/" element={<PublicPage page="faq" />} />
      <Route path="/privacy/" element={<PublicPage page="privacy" />} />
      <Route path="/terms/" element={<PublicPage page="terms" />} />
    </>}
    <Route path="/login/" element={<Login />} />
    <Route path="/access-pending/" element={<AccessPending />} />
    <Route path="/commitments/" element={surface.id === "lawyerlab" ? <Commitments /> : <Navigate to={surface.home} replace />} />
    <Route path="/work-with-us/" element={surface.id === "lawyerlab" ? <WorkWithUs /> : <Navigate to={surface.home} replace />} />
    <Route path="/mvp/" element={surface.id === "lawyerlab" ? <Mvp /> : <Navigate to={surface.home} replace />} />
    <Route path="/mvp/transaction-intake" element={<LegacyWorkflowRedirect id="term-isolation" />} />
    <Route path="/playground/" element={<Playground />} />
    <Route path="/playground/transaction-intake" element={<LegacyWorkflowRedirect id="term-isolation" />} />
    <Route path="/playground/jobs/:jobId" element={<JobPlayground />} />
    <Route path="/playground/hr/hiring" element={<LegacyWorkflowRedirect id="hr-hiring" />} />
    <Route path="/mvp/hr/hiring" element={<LegacyWorkflowRedirect id="hr-hiring" />} />
    <Route path="/app/" element={surface.id === "lawyerlab" ? <Navigate to="/mvp/" replace /> : <Navigate to={surface.home} replace />} />
    <Route path="/app/jobs/:jobId" element={<LegacyJobRedirect />} />
    <Route path="*" element={<Shell><NotFound /></Shell>} />
  </Routes></TierProvider>
}

// Legacy workflow links only land on a workflow the active surface owns; otherwise the surface home.
function LegacyWorkflowRedirect({ id }: { id: WorkflowId }) {
  const owned = surface.workflows.includes(id)
  return <Navigate to={owned ? `/playground/?workflow=${id}` : surface.home} replace />
}

function LegacyJobRedirect() {
  return <Navigate to={`/playground/jobs/${window.location.pathname.split("/").pop()}`} replace />
}

function NotFound() {
  return <section className="playground-empty"><h1>Page not found</h1><p>Return to the MVP upload or playground.</p></section>
}
