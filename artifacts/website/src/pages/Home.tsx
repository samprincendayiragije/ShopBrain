import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { Menu, X, ArrowRight, Shield, Smartphone, Users, MapPin, Mail, Phone, MessageCircle, ClipboardList, Bell, CheckCircle2, LockKeyhole } from "lucide-react";

// This is Shop Brain's HUMAN business line — Sam replies personally here.
// Kept separate from the automated bot number (used inside webhook.ts) so
// new contacts build trust with a real person before using the bot.
const WHATSAPP_BUSINESS_NUMBER = "250799627713"; // no + or leading zero, used for wa.me links

const businessTypes = [
  "Grocery / Shop",
  "Salon / Barber",
  "Boutique / Clothing",
  "Pharmacy",
  "Restaurant / Bar",
  "Other",
];

const navLinks = [
  { name: "About", href: "#about" },
  { name: "How it Works", href: "#how-it-works" },
  { name: "Get Started", href: "#get-started" },
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
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors border border-border rounded-md px-3 py-1.5"
              data-testid="link-admin"
            >
              <LockKeyhole size={14} /> Admin
            </Link>
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
            <Link
              href="/admin"
              className="flex items-center gap-2 text-lg font-medium text-foreground py-2 border-b border-border/50"
            >
              <LockKeyhole size={18} /> Admin
            </Link>
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
                  href="#get-started" 
                  onClick={(e) => scrollToSection(e, "#get-started")}
                  className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-md font-medium hover:bg-primary/90 transition-colors shadow-sm"
                >
                  Get Started <ArrowRight size={18} />
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

        {/* Get Started / QR Section */}
        <section id="get-started" className="py-20 md:py-28 bg-card px-4 md:px-6 border-y border-border">
          <div className="container mx-auto max-w-5xl">
            <div className="max-w-2xl mx-auto text-center mb-12">
              <h2 className="text-sm font-bold tracking-wider text-primary uppercase mb-3">Get Started</h2>
              <h3 className="text-3xl md:text-4xl font-display font-bold mb-4">Scan to chat, or scan to learn more.</h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                No app to install. Choose one below to get going in seconds.
              </p>
            </div>

            <div className="max-w-sm mx-auto">
              {/* WhatsApp QR */}
              <div className="bg-background rounded-2xl border border-border shadow-sm p-6 flex flex-col items-center text-center">
                <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-xl overflow-hidden border border-border mb-5 bg-white">
                  <img
                    src={`${import.meta.env.BASE_URL}images/qr-whatsapp.png`}
                    alt="QR code to chat with Shop Brain on WhatsApp"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex items-center gap-2 text-primary font-bold mb-2">
                  <MessageCircle size={20} />
                  <span>Scan to chat with Shop Brain</span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Opens a WhatsApp chat with our team directly.
                </p>
                <a
                  href={`https://wa.me/${WHATSAPP_BUSINESS_NUMBER}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:underline break-all"
                  data-testid="link-whatsapp-fallback"
                >
                  wa.me/{WHATSAPP_BUSINESS_NUMBER}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* About / How it Works Section */}
        <section id="about" className="py-20 md:py-32 px-4 md:px-6">
          <div className="container mx-auto max-w-6xl">
            <div className="max-w-3xl mb-16">
              <h2 className="text-sm font-bold tracking-wider text-primary uppercase mb-3">About Shop Brain</h2>
              <h3 className="text-3xl md:text-4xl font-display font-bold mb-6">A practical tool for real businesses.</h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Shop Brain is a WhatsApp-based debt tracking tool designed specifically for small shop owners. We understand that running a business is demanding, so we built a solution that fits seamlessly into your daily routine. It works in both English and Kinyarwanda.
              </p>
            </div>

            <div id="how-it-works" className="mt-12">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { icon: MessageCircle, step: "1", title: "Text the Bot", desc: "Message Shop Brain on WhatsApp like you would any contact — no install, no login." },
                  { icon: ClipboardList, step: "2", title: "Add Customer Debt", desc: "Record what a customer owes in seconds, right inside the chat." },
                  { icon: Bell, step: "3", title: "Bot Sends Reminder", desc: "Shop Brain follows up automatically, in English or Kinyarwanda." },
                  { icon: CheckCircle2, step: "4", title: "Customer Pays", desc: "Mark the debt as paid and your balance updates instantly." },
                ].map((item, idx) => (
                  <div key={item.step} className="relative bg-card p-6 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow">
                    <span className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shadow-sm">
                      {item.step}
                    </span>
                    <div className="w-12 h-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center mb-5">
                      <item.icon size={22} />
                    </div>
                    <h4 className="text-lg font-bold mb-2 font-display">{item.title}</h4>
                    <p className="text-muted-foreground leading-relaxed text-sm">{item.desc}</p>
                    {idx < 3 && (
                      <ArrowRight className="hidden lg:block absolute top-1/2 -right-4 -translate-y-1/2 text-border" size={20} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section id="contact" className="py-20 md:py-32 bg-card px-4 md:px-6 border-y border-border">
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
                    <h5 className="font-bold text-lg">WhatsApp</h5>
                    <p className="text-muted-foreground mt-1 text-lg">+250 799 627 713</p>
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

            <div className="bg-background p-8 md:p-10 rounded-2xl border border-border shadow-xl">
              <h4 className="text-xl font-bold font-display mb-1">Request Access</h4>
              <p className="text-sm text-muted-foreground mb-6">Submit your details and we'll open a WhatsApp chat pre-filled with your request.</p>
              <RequestAccessForm />
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
              <p>Shop Brain Ltd collects WhatsApp phone numbers and customer debt records on behalf of shop owners.</p>
              <p>All data is stored securely and is only accessible to the authorised shop owner.</p>
              <p>Shop Brain Ltd does not sell, share, or transfer customer data to any third party.</p>
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
            Shop Brain Ltd — Registered in Rwanda.
          </p>
        </div>
      </footer>
    </div>
  );
}

function RequestAccessForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessType, setBusinessType] = useState(businessTypes[0]);
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const text = [
      "Hi Shop Brain, I'd like to request access.",
      `Name: ${name}`,
      `Phone: ${phone}`,
      `Business type: ${businessType}`,
      message ? `Message: ${message}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const url = `https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">Full Name</label>
        <input
          type="text"
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
          placeholder="Your name"
          data-testid="input-request-name"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="phone" className="text-sm font-medium">Phone Number</label>
        <input
          type="tel"
          id="phone"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full px-4 py-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
          placeholder="Your WhatsApp number"
          data-testid="input-request-phone"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="business-type" className="text-sm font-medium">Business Type</label>
        <select
          id="business-type"
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value)}
          className="w-full px-4 py-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
          data-testid="select-request-business-type"
        >
          {businessTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="message" className="text-sm font-medium">Message (optional)</label>
        <textarea
          id="message"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full px-4 py-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow resize-none"
          placeholder="Anything else we should know?"
          data-testid="input-request-message"
        ></textarea>
      </div>
      <button
        type="submit"
        className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3.5 rounded-md font-bold text-lg hover:bg-primary/90 transition-colors shadow-sm"
        data-testid="button-request-access"
      >
        <MessageCircle size={20} /> Send via WhatsApp
      </button>
    </form>
  );
}