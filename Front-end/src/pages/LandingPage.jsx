import React from "react";
import { HeroSection } from "../components/hireiq/HeroSection";
import { MarqueeSection } from "../components/hireiq/MarqueeSection";
import { AboutSection } from "../components/hireiq/AboutSection";
import { ServicesSection } from "../components/hireiq/ServicesSection";
import { ProjectsSection } from "../components/hireiq/ProjectsSection";
import { PricingSection } from "../components/hireiq/PricingSection";

export default function LandingPage() {
    return (
      <main className="bg-black text-white overflow-x-clip">
        <HeroSection />
        <MarqueeSection />
        <AboutSection />
        <ServicesSection />
        <ProjectsSection />
        <PricingSection />
        <footer className="bg-[#0C0C0C] py-10 text-center text-white/40 text-xs tracking-widest uppercase">
          © {new Date().getFullYear()} HireIQ — The Enterprise AI Hiring Platform
        </footer>
      </main>
    );
}