import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useAuth } from "@/hooks/useAuth";
import { GafcoreLogo } from "@/components/GafcoreLogo";

export function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useI18n();
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/gafcore" });
  };

  const scrollToSection = (sectionId: string) => {
    setMobileOpen(false);
    if (window.location.pathname !== "/gafcore") {
      window.location.assign(`/gafcore#${sectionId}`);
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <GafcoreLogo variant="header" linkTo="/gafcore" className="-my-4" />

        <nav className="hidden items-center gap-8 md:flex">
          <Link to="/gafcore" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {t("nav.home")}
          </Link>
          <Link to="/gafcore" hash="planes" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {t("nav.pricing")}
          </Link>
          <button
            type="button"
            onClick={() => scrollToSection("producto")}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("nav.features")}
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("recursos")}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("nav.howItWorks")}
          </button>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <LanguageSwitcher variant="compact" />
          {!loading && user ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/gafcore/projects">Proyectos</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/gafcore/app">{t("dash.dashboard")}</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                {t("nav.signOut")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="hero" size="sm" asChild>
                <Link to="/login">{t("nav.login")}</Link>
              </Button>
            </>
          )}
        </div>

        <button type="button" className="text-foreground md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border bg-background px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            <Link to="/gafcore" className="text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>
              {t("nav.home")}
            </Link>
            <Link to="/gafcore" hash="planes" className="text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>
              {t("nav.pricing")}
            </Link>
            <button type="button" className="text-left text-sm text-muted-foreground" onClick={() => scrollToSection("producto")}>
              {t("nav.features")}
            </button>
            <button type="button" className="text-left text-sm text-muted-foreground" onClick={() => scrollToSection("recursos")}>
              {t("nav.howItWorks")}
            </button>
            <div className="mt-2 flex flex-col gap-2">
              <LanguageSwitcher />
              {!loading && user ? (
                <>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/gafcore/projects" onClick={() => setMobileOpen(false)}>
                      Proyectos
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/gafcore/app" onClick={() => setMobileOpen(false)}>
                      {t("dash.dashboard")}
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleSignOut}>
                    {t("nav.signOut")}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="hero" size="sm" asChild>
                    <Link to="/login">{t("nav.login")}</Link>
                  </Button>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
