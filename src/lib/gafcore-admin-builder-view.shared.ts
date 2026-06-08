export const GAFCORE_ADMIN_BUILDER_VIEW_KEY = "gafcore_admin_builder_view";
export const GAFCORE_ADMIN_VIEW_CHANGE_EVENT = "gafcore:admin-view-change";

export function readGafcoreAdminBuilderView(): boolean {
  try {
    return sessionStorage.getItem(GAFCORE_ADMIN_BUILDER_VIEW_KEY) === "1";
  } catch {
    return false;
  }
}

export function setGafcoreAdminBuilderView(enabled: boolean): void {
  try {
    if (enabled) sessionStorage.setItem(GAFCORE_ADMIN_BUILDER_VIEW_KEY, "1");
    else sessionStorage.removeItem(GAFCORE_ADMIN_BUILDER_VIEW_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(GAFCORE_ADMIN_VIEW_CHANGE_EVENT));
}
