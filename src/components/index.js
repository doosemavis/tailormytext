export { Toggle, Slider, Segment, Section, FontPicker, Tip } from "./Primitives";
export { DiaTextReveal } from "./DiaTextReveal";
export { default as UploadBadge } from "./UploadBadge";
export { SidebarRecentDocs, LandingRecentDocs } from "./RecentDocsList";
export { LibrarySection } from "./LibrarySection";
export { default as LibraryTeaseSection } from "./LibraryTeaseSection";
export { LandingBookshelf, SidebarBookshelf } from "./BookshelfList";
export { default as DocumentBody } from "./DocumentBody";
export { useReadingGuide } from "./ReadingGuideOverlay";
export { default as UserMenu } from "./UserMenu";
export { default as BookLoader } from "./BookLoader";
export { default as PulsatingButton } from "./PulsatingButton";
export { default as PendingDeletionBanner } from "./PendingDeletionBanner";
export { default as PostDeletionLockoutBanner } from "./PostDeletionLockoutBanner";
export { default as ErrorBoundary } from "./ErrorBoundary";
export { default as UncertaintyBadge } from "./UncertaintyBadge";
export { default as ReaderEmptyState } from "./ReaderEmptyState";
export { default as Footer } from "./Footer";
export { default as LegalLayout } from "./LegalLayout";
// Modals (PricingModal, PaywallModal, CheckoutModal, AuthModal,
// AvatarSettingsModal, EditChaptersModal) are intentionally NOT re-exported
// here. They're loaded lazily via React.lazy in App.jsx — re-exporting them
// through this barrel would pull them back into the static dependency graph
// and defeat the code-split. Import them directly from their files when needed.
