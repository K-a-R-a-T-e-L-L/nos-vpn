import BenefitsSection from "./sections/BenefitsSection/BenefitsSection";
import DevicesSection from "./sections/DevicesSection/DevicesSection";
import FaqSection from "./sections/FaqSection/FaqSection";
import FinalCtaSection from "./sections/FinalCtaSection/FinalCtaSection";
import HeroSection from "./sections/HeroSection/HeroSection";
import HowItWorksSection from "./sections/HowItWorksSection/HowItWorksSection";
import ProblemSection from "./sections/ProblemSection/ProblemSection";
import SyncSection from "./sections/SyncSection/SyncSection";
import TariffsSection from "./sections/TariffsSection/TariffsSection";
import styles from "./HomePage.module.css";

export default function HomePage() {
  return (
    <div className={styles.page}>
      <HeroSection />
      <ProblemSection />
      <HowItWorksSection />
      <TariffsSection />
      <DevicesSection />
      <BenefitsSection />
      <SyncSection />
      <FaqSection />
      <FinalCtaSection />
    </div>
  );
}
