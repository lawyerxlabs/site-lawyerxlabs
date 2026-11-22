import { BookOpen, ChevronLeft, ChevronRight, FileKey2, FileSearch, ListChecks, LockKeyhole, Menu, MailPlus, Plus, SearchCheck, UserPlus, UserRound, X, type LucideIcon } from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Link, useLocation } from "react-router-dom"
import { Fragment, useRef, useState } from "react"
import { identityLabel } from "@/lib/api"
import { getRoutableWorkflow, WORKFLOWS, type Workflow, type WorkflowId } from "@/lib/workflows"
import { surface } from "@/surface"
import { useTier } from "@/lib/useTier"
import { identityRequirement, isListed, useWorkflowCatalog } from "@/lib/useWorkflowCapabilities"
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

// Metadata icon name -> Lucide component (task-specific, not a generic icon).
const WORKFLOW_ICONS: Record<Workflow["icon"], LucideIcon> = { FileKey2, ListChecks, SearchCheck, FileSearch }

type ShellProps = { children: React.ReactNode; workflowId?: WorkflowId; reviewWorkspace?: boolean }

/** Shared product shell for the playground routes. */
export function Shell({ children, workflowId, reviewWorkspace }: ShellProps) {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [trustOpen, setTrustOpen] = useState(false)
  // Trust Centre is opened by plain buttons, so remember the real opener for focus return.
  const trustOpenerRef = useRef<HTMLElement | null>(null)
  const navToggleRef = useRef<HTMLButtonElement>(null)
  const { signedIn, ready, identity, login, logout } = useTier()
  const catalog = useWorkflowCatalog()
  // Fail closed: an unknown id highlights nothing rather than defaulting to a workflow.
  const activeWorkflow = getRoutableWorkflow(workflowId ?? new URLSearchParams(location.search).get("workflow"))
  const onPlayground = location.pathname.startsWith("/playground")
  const newDocumentTo = "/playground/?workflow=docalias"
  // Pending (!ready): no sign-in copy, locks, or account actions until auth state resolves.
  const workspaceNote = ready && !signedIn ? <p className="sidebar-gate-note">Some workspace workflows require sign in.</p> : null
  // Only surfaces that serve docalias get the Alias document action (the HR-only surface does not).
  const aliasActive = activeWorkflow?.id === "docalias"
  const alias = WORKFLOWS.find((w) => w.id === "docalias")
  const newDocumentAction = !alias ? null : !ready ? <div className="sidebar-item sidebar-new sidebar-status"><Plus size={17} /><span>Alias document</span></div> : !signedIn && identityRequirement(alias, catalog) === "protected" ? <div className="sidebar-item sidebar-new sidebar-status sidebar-locked" title="Alias document requires sign in"><Plus size={17} /><span>Alias document</span><span className="visually-hidden">Sign in required</span><LockKeyhole size={14} aria-hidden="true" /></div> : <Link className={`sidebar-item sidebar-new${aliasActive ? " active" : ""}`} to={newDocumentTo} title="Alias document" aria-current={aliasActive ? "page" : undefined}><Plus size={17} /><span>Alias document</span></Link>
  // Alias document has its own top action, so docalias is not repeated in the Workspace list.
  const workflowNav = (closeOnNavigate: boolean) => {
    const rows = WORKFLOWS.filter((w) => !w.disabled && w.id !== "docalias" && isListed(w, catalog)).map((workflow) => {
      const Icon = WORKFLOW_ICONS[workflow.icon]
      if (!ready) return <div key={workflow.id} className="sidebar-item sidebar-status"><Icon size={17} /><span>{workflow.action}</span></div>
      if (!signedIn && identityRequirement(workflow, catalog) === "protected") return <div key={workflow.id} className="sidebar-item sidebar-status sidebar-locked" title={`${workflow.action} requires sign in`}><Icon size={17} /><span>{workflow.action}</span><span className="visually-hidden">Sign in required</span><LockKeyhole size={14} aria-hidden="true" /></div>
      const link = <Link className={`sidebar-item${activeWorkflow?.id === workflow.id ? " active" : ""}`} to={`/playground/?workflow=${workflow.id}`} title={workflow.action} aria-current={activeWorkflow?.id === workflow.id ? "page" : undefined}><Icon size={17} /><span>{workflow.action}</span></Link>
      return closeOnNavigate ? <SheetClose asChild key={workflow.id}>{link}</SheetClose> : <Fragment key={workflow.id}>{link}</Fragment>
    })
    const comingSoon = WORKFLOWS.filter((w) => w.disabled)
    return (
      <>
        <p className="sidebar-label">Workspace</p>{workspaceNote}{rows}
        {comingSoon.length > 0 && (
          <div className="sidebar-status-group">
            <p className="sidebar-status-label">Coming soon</p>
            {comingSoon.map((workflow) => {
              const Icon = WORKFLOW_ICONS[workflow.icon]
              return <div key={workflow.id} className="sidebar-item sidebar-status"><Icon size={17} /><span>{workflow.action}</span></div>
            })}
          </div>
        )}
      </>
    )
  }
  const accountAction = !ready ? null : signedIn ? (
    <button className="sidebar-item sidebar-account" type="button" onClick={logout} title={identityLabel(identity)}><UserRound size={17} /><span>Sign out</span></button>
  ) : (
    <>
      <a className="sidebar-item" href={surface.waitlistUrl} title="Join waitlist"><UserPlus size={17} /><span>Join waitlist</span></a>
      <button className="sidebar-item sidebar-account" type="button" onClick={login} title="Sign in"><UserRound size={17} /><span>Sign in</span></button>
    </>
  )
  const openTrust = (event: React.MouseEvent<HTMLElement>) => { trustOpenerRef.current = event.currentTarget; setNavOpen(false); setTrustOpen(true) }
  // Mobile opener lives inside the sheet, which unmounts on open; fall back to the nav toggle.
  const restoreTrustFocus = (event: Event) => {
    event.preventDefault()
    const opener = trustOpenerRef.current
    ;(opener?.isConnected ? opener : navToggleRef.current)?.focus()
  }
  const contactLink = surface.copy.contactUrl ? <a className="sidebar-item" href={surface.copy.contactUrl}><MailPlus size={17} /><span>Contact</span></a> : null
  const trustButton = <button className="sidebar-item" type="button" onClick={openTrust} title={surface.copy.trustTitle}><BookOpen size={17} /><span>{surface.copy.trustTitle}</span></button>

  return (
    <div className="app-shell shell-playground">
      <DialogPrimitive.Root open={trustOpen} onOpenChange={setTrustOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="ll-dialog-overlay" />
          <DialogPrimitive.Content className="ll-alert-dialog trust-dialog" onCloseAutoFocus={restoreTrustFocus}>
            <DialogPrimitive.Title className="ll-alert-dialog-title">{surface.copy.trustTitle}</DialogPrimitive.Title>
            <DialogPrimitive.Description asChild>
              <ul className="trust-list">
                {surface.copy.trustPoints.map(([title, body]) => <li key={title}><strong>{title}</strong> — {body}</li>)}
              </ul>
            </DialogPrimitive.Description>
            <div className="trust-dialog-close"><DialogPrimitive.Close asChild><Button variant="secondary">Close</Button></DialogPrimitive.Close></div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <div className="mobile-bar">
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger asChild>
            <button ref={navToggleRef} className="mobile-nav-toggle" type="button" aria-label="Open navigation">
              <Menu size={20} />
            </button>
          </SheetTrigger>
          <SheetContent className="playground-sidebar mobile-nav" aria-label="Workspace navigation">
            <SheetTitle className="visually-hidden">Workspace navigation</SheetTitle>
            <div className="sidebar-top">
              <div className="sidebar-brand">
                <Link className="sidebar-brand-link" to="/"><img className="brand-mark" src={surface.icon} alt="" aria-hidden="true" /><strong>{surface.name}</strong></Link>
                <SheetClose asChild><button className="sidebar-mobile-close" type="button" aria-label="Close navigation"><X size={18} /></button></SheetClose>
              </div>
              <nav className="sidebar-nav" aria-label="Workspace navigation">
                {newDocumentAction && <SheetClose asChild>{newDocumentAction}</SheetClose>}
                {workflowNav(true)}
                <div className="sidebar-note"><LockKeyhole size={15} /><span>{surface.copy.sidebarNote}</span></div>
              </nav>
            </div>
            <div className="sidebar-bottom">
              {contactLink}
              {trustButton}
              {accountAction}
            </div>
          </SheetContent>
        </Sheet>
        <Link className="mobile-brand" to="/"><img className="brand-mark" src={surface.icon} alt="" aria-hidden="true" /><strong>{surface.name}</strong></Link>
        {activeWorkflow && <span className="mobile-context">{activeWorkflow.label}</span>}
      </div>

      <div className="playground-frame">
        <aside className={`playground-sidebar${collapsed ? " sidebar-collapsed" : ""}`} id="workspace-navigation" aria-label="Workspace navigation">
          <div className="sidebar-top">
            <div className="sidebar-brand">
              <Link className="sidebar-brand-link" to="/"><img className="brand-mark" src={surface.icon} alt="" aria-hidden="true" /><strong>{surface.name}</strong></Link>
              <button className="sidebar-collapse" type="button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} aria-controls="workspace-navigation" onClick={() => setCollapsed((value) => !value)}>
                {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
              </button>
            </div>
            <nav className="sidebar-nav" aria-label="Workflow navigation">
              {newDocumentAction}
              {workflowNav(false)}
              <div className="sidebar-note"><LockKeyhole size={15} /><span>{surface.copy.sidebarNote}</span></div>
            </nav>
          </div>
          <div className="sidebar-bottom">
            {contactLink}
            {trustButton}
            {accountAction}
          </div>
        </aside>
        <main className={`playground-body playground-content${reviewWorkspace ? " review-workspace" : ""}`}>
          {onPlayground ? children : <div className="config-panel">{children}</div>}
        </main>
      </div>
    </div>
  )
}
