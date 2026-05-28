import { Link } from "@tanstack/react-router";
import { useI18n } from "@/i18n/I18nProvider";
import { GafcoreLogo } from "@/components/GafcoreLogo";

export function LandingFooter() {
  const { t } = useI18n();

  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    } else {
      window.location.assign(`/gafcore#${sectionId}`);
    }
  };

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div>
            <div className="mb-4">
              <GafcoreLogo variant="full" linkTo="/gafcore" imgClassName="h-12" />
            </div>
            <p className="text-xs text-muted-foreground">{t("footer.tagline")}</p>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">{t("footer.product")}</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li>
                <Link to="/gafcore" hash="planes" className="hover:text-foreground">
                  {t("nav.pricing")}
                </Link>
              </li>
              <li>
                <button type="button" onClick={() => scrollToSection("producto")} className="hover:text-foreground text-left">
                  {t("nav.features")}
                </button>
              </li>
              <li>
                <button type="button" onClick={() => scrollToSection("recursos")} className="hover:text-foreground text-left">
                  {t("footer.stores")}
                </button>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">{t("footer.support")}</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li><a href="mailto:support@gafcore.com" className="hover:text-foreground">{t("footer.helpCenter")}</a></li>
              <li><a href="mailto:contact@gafcore.com" className="hover:text-foreground">{t("footer.contact")}</a></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">{t("footer.legal")}</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li><Link to="/privacy" className="hover:text-foreground">{t("footer.privacy")}</Link></li>
              <li><Link to="/terms" className="hover:text-foreground">{t("footer.terms")}</Link></li>
              <li><Link to="/refund" className="hover:text-foreground">Refund Policy</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} GafCore. {t("footer.rights")}
        </div>
      </div>
    </footer>
  );
}
