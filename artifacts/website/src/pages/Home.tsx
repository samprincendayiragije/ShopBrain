import React, { useEffect, useState } from "react";
import { Menu, X, ArrowRight, Shield, Smartphone, Users, MapPin, Mail, Phone } from "lucide-react";

const navLinks = [
  { name: "About", href: "#about" },
  { name: "How it Works", href: "#how-it-works" },
  { name: "Contact", href: "#contact" },
  { name: "Privacy", href: "#privacy" },
];

export default function Home() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const element = document.querySelector(href);
    if (element) {
      const top = element.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: "smooth" });
    }
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background font-sans text-foreground">
      {/* Header */}
      <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${isScrolled ? "bg-background/95 backdrop-blur-md shadow-sm py-3" : "bg-transparent py-5"}`}>
        <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
          <a href="#hero" onClick={(e) => scrollToSection(e, "#hero")} className="text-2xl font-bold font-display tracking-tight text-primary">
            Shop Brain
          </a>
          
          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a 
                key={link.name} 
                href={link.href}
                onClick={(e) => scrollToSection(e, link.href)}
                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
              >
                {link.name}
              </a>
            ))}
          </nav>

          {/* Mobile Menu Toggle */}
          <button 
            className="md:hidden p-2 text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-background pt-20 px-4 md:hidden">
          <nav className="flex flex-col gap-6 p-4">
            {navLinks.map((link) => (
              <a 
                key={link.name} 
                href={link.href}
                onClick={(e) => scrollToSection(e, link.href)}
                className="text-lg font-medium text-foreground py-2 border-b border-border/50"
              >
                {link.name}
              </a>
            ))}
          </nav>
        </div>
      )}

      <main className="flex-1">
        {/* Hero Section */}
        <section id="hero" className="pt-32 pb-16 md:pt-40 md:pb-24 px-4 md:px-6">
          <div className="container mx-auto max-w-6xl grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6 md:space-y-8 animate-in slide-in-from-bottom-8 duration-700 fade-in">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-[1.1] text-foreground">
                Manage customer debts through WhatsApp.
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl">
                Shop Brain builds messaging-based business management tools that help small and informal shop owners in Rwanda track debts, send payment reminders, and manage customer relationships — accessible directly through WhatsApp.
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-4">
                <a 
                  href="#contact" 
                  onClick={(e) => scrollToSection(e, "#contact")}
                  className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-md font-medium hover:bg-primary/90 transition-colors shadow-sm"
                >
                  Contact Us <ArrowRight size={18} />
                </a>
                <a 
                  href="#about"
                  onClick={(e) => scrollToSection(e, "#about")}
                  className="inline-flex items-center justify-center px-6 py-3 rounded-md font-medium text-foreground hover:bg-muted transition-colors border border-border"
                >
                  Learn More
                </a>
              </div>
            </div>
            <div className="relative rounded-2xl overflow-hidden shadow-2xl aspect-[4/3] bg-muted animate-in slide-in-from-right-8 duration-700 fade-in delay-200">
              <img 
                src={`${import.meta.env.BASE_URL}images/shop-hero.jpg`} 
                alt="Practical business management"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?q=80&w=1000&auto=format&fit=crop";
                }}
              />
              <div className="absolute inset-0 bg-primary/10 mix-blend-multiply"></div>
            </div>
          </div>
        </section>

        {/* About / How it Works Section */}
        <section id="about" className="py-20 md:py-32 bg-card px-4 md:px-6 border-y border-border">
          <div className="container mx-auto max-w-6xl">
            <div className="max-w-3xl mb-16">
              <h2 className="text-sm font-bold tracking-wider text-primary uppercase mb-3">About Shop Brain</h2>
              <h3 className="text-3xl md:text-4xl font-display font-bold mb-6">A practical tool for real businesses.</h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Shop Brain is a WhatsApp-based debt tracking tool designed specifically for small shop owners. We understand that running a business is demanding, so we built a solution that fits seamlessly into your daily routine. It works in both English and Kinyarwanda.
              </p>
            </div>

            <div id="how-it-works" className="grid md:grid-cols-3 gap-8 mt-12">
              <div className="bg-background p-8 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center mb-6">
                  <Smartphone size={24} />
                </div>
                <h4 className="text-xl font-bold mb-3 font-display">No App to Install</h4>
                <p className="text-muted-foreground leading-relaxed">
                  Forget about downloading heavy applications or learning new software. Shop Brain works directly through WhatsApp messages you already send every day.
                </p>
              </div>

              <div className="bg-background p-8 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center mb-6">
                  <Users size={24} />
                </div>
                <h4 className="text-xl font-bold mb-3 font-display">Customer Lookup</h4>
                <p className="text-muted-foreground leading-relaxed">
                  Instantly look up customers, record items owed, and keep an accurate running balance of debts without leaving your WhatsApp chat.
                </p>
              </div>

              <div className="bg-background p-8 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center mb-6">
                  <Shield size={24} />
                </div>
                <h4 className="text-xl font-bold mb-3 font-display">Mark as Paid</h4>
                <p className="text-muted-foreground leading-relaxed">
                  Easily log payments and update balances securely. Keep your records straight and build trust with your customers through transparent accounting.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section id="contact" className="py-20 md:py-32 px-4 md:px-6">
          <div className="container mx-auto max-w-6xl grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-sm font-bold tracking-wider text-primary uppercase mb-3">Get in Touch</h2>
              <h3 className="text-3xl md:text-4xl font-display font-bold mb-6">We're here to help you grow.</h3>
              <p className="text-lg text-muted-foreground leading-relaxed mb-10">
                Whether you have questions about setting up Shop Brain for your store, or need support with your account, our team is ready to assist you.
              </p>

              <div className="space-y-8">
                <div className="flex items-start gap-4">
                  <div className="mt-1 bg-primary/10 p-3 rounded-lg text-primary">
                    <Phone size={24} />
                  </div>
                  <div>
                    <h5 className="font-bold text-lg">Phone</h5>
                    <p className="text-muted-foreground mt-1 text-lg">+250 795 120 043</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="mt-1 bg-primary/10 p-3 rounded-lg text-primary">
                    <Mail size={24} />
                  </div>
                  <div>
                    <h5 className="font-bold text-lg">Email</h5>
                    <p className="text-muted-foreground mt-1 text-lg break-all">Ndayiragijesamuelprince@gmail.com</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="mt-1 bg-primary/10 p-3 rounded-lg text-primary">
                    <MapPin size={24} />
                  </div>
                  <div>
                    <h5 className="font-bold text-lg">Address</h5>
                    <p className="text-muted-foreground mt-1 text-lg">Kigese, Ruyenzi, Southern 0000, Rwanda</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-card p-8 md:p-10 rounded-2xl border border-border shadow-xl">
              <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium">Full Name</label>
                  <input 
                    type="text" 
                    id="name" 
                    className="w-full px-4 py-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow" 
                    placeholder="Your name"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="phone" className="text-sm font-medium">Phone Number</label>
                  <input 
                    type="tel" 
                    id="phone" 
                    className="w-full px-4 py-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow" 
                    placeholder="Your WhatsApp number"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="message" className="text-sm font-medium">Message</label>
                  <textarea 
                    id="message" 
                    rows={4}
                    className="w-full px-4 py-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow resize-none" 
                    placeholder="How can we help?"
                  ></textarea>
                </div>
                <button type="submit" className="w-full bg-primary text-primary-foreground py-3.5 rounded-md font-bold text-lg hover:bg-primary/90 transition-colors shadow-sm">
                  Send Message
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* Privacy Policy */}
        <section id="privacy" className="py-20 bg-muted px-4 md:px-6">
          <div className="container mx-auto max-w-4xl bg-card p-8 md:p-12 rounded-2xl border border-border shadow-sm">
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-8 text-foreground flex items-center gap-3">
              <Shield className="text-primary" /> Privacy Policy
            </h2>
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p>Shop Brain collects WhatsApp phone numbers and customer debt records on behalf of shop owners.</p>
              <p>All data is stored securely and is only accessible to the authorised shop owner.</p>
              <p>Shop Brain does not sell, share, or transfer customer data to any third party.</p>
              <p>Data is retained as long as the shop owner uses the service.</p>
              <p>WhatsApp messages sent to Shop Brain are processed to extract commands (e.g. ADD, PAID, customer lookup) and are not stored beyond what is needed to fulfil the request.</p>
              <div className="mt-8 p-6 bg-background rounded-xl border border-border">
                <p className="font-medium text-foreground mb-2">For data deletion requests, contact:</p>
                <a href="mailto:Ndayiragijesamuelprince@gmail.com" className="text-primary hover:underline font-medium text-lg break-all">Ndayiragijesamuelprince@gmail.com</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-foreground text-background py-12 px-4 md:px-6">
        <div className="container mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-2xl font-bold font-display tracking-tight text-white">
            Shop Brain
          </div>
          <p className="text-background/70 font-medium">
            Shop Brain — Registered in Rwanda
          </p>
        </div>
      </footer>
    </div>
  );
}
