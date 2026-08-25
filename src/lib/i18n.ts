/**
 * i18n — Multi-language UI translations
 *
 * Supported languages: English, Kiswahili, French
 * Falls back to English for missing keys.
 */

export type Lang = "en" | "sw" | "fr";

export const LANGUAGES: Array<{ code: Lang; label: string; flag: string }> = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "sw", label: "Kiswahili", flag: "🇰🇪" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
];

type Dict = Record<string, string>;

const en: Dict = {
  // Navigation
  "nav.home": "Home",
  "nav.search": "Search",
  "nav.progress": "Progress",
  "nav.profile": "Profile",
  "nav.calendar": "Calendar",
  "nav.exams": "Exams",
  "nav.children": "My Children",
  "nav.create": "Create",
  // Auth
  "auth.signup": "Create account",
  "auth.signin": "Sign in",
  "auth.welcome": "Welcome back",
  "auth.create": "Create your account",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.name": "Name (optional)",
  "auth.phone": "Phone number",
  "auth.forgot": "Forgot your password?",
  "auth.verify": "Verify your email",
  "auth.verifyCode": "Enter the code we sent you",
  "auth.verifyBtn": "Verify email",
  "auth.resend": "Didn't get a code? Resend",
  // Landing
  "landing.student": "I'm a Student (Personal)",
  "landing.school": "I'm a School Student",
  "landing.parent": "I'm a Parent (Family Mode)",
  // Dashboard
  "dash.greeting.morning": "Good morning",
  "dash.greeting.afternoon": "Good afternoon",
  "dash.greeting.evening": "Good evening",
  "dash.subjects": "subjects",
  "dash.tapToStart": "Tap a subject to start learning",
  "dash.continue": "Continue where you left off",
  "dash.resume": "Resume",
  "dash.streak": "day streak",
  // Study
  "study.lesson": "Lesson",
  "study.cards": "Cards",
  "study.quiz": "Quiz",
  "study.start": "Start",
  "study.next": "Next",
  "study.previous": "Previous",
  "study.flip": "Tap to flip",
  "study.submit": "Submit quiz",
  "study.scored": "You scored",
  "study.tryAgain": "Try again",
  "study.mastered": "Excellent! You've mastered this topic",
  "study.planAI": "Plan with AI",
  // Common
  "common.loading": "Loading…",
  "common.error": "Something went wrong",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.delete": "Delete",
  "common.close": "Close",
  "common.back": "Back",
  "common.continue": "Continue",
  "common.locked": "Locked",
  "common.comingSoon": "Coming soon",
  "common.topics": "topics",
};

const sw: Dict = {
  "nav.home": "Nyumbani",
  "nav.search": "Tafuta",
  "nav.progress": "Maendeleo",
  "nav.profile": "Wasifu",
  "nav.calendar": "Kalenda",
  "nav.exams": "Mitihani",
  "nav.children": "Watoto Wangu",
  "nav.create": "Tengeneza",
  "auth.signup": "Fungua akaunti",
  "auth.signin": "Ingia",
  "auth.welcome": "Karibu tena",
  "auth.create": "Fungua akaunti yako",
  "auth.email": "Barua pepe",
  "auth.password": "Nenosiri",
  "auth.name": "Jina (hiari)",
  "auth.phone": "Nambari ya simu",
  "auth.forgot": "Umesahau nenosiri?",
  "auth.verify": "Thibitisha barua pepe yako",
  "auth.verifyCode": "Weka nambari tuma",
  "auth.verifyBtn": "Thibitisha",
  "auth.resend": "Hujaipata? Tuma tena",
  "landing.student": "Mimi ni Mwanafunzi",
  "landing.school": "Mimi ni Mwanafunzi wa Shule",
  "landing.parent": "Mimi ni Mzazi (Family Mode)",
  "dash.greeting.morning": "Habari za asubuhi",
  "dash.greeting.afternoon": "Habari za mchana",
  "dash.greeting.evening": "Habari za jioni",
  "dash.subjects": "masomo",
  "dash.tapToStart": "Bofya somo kuanza kujifunza",
  "dash.continue": "Endelea ulipoacha",
  "dash.resume": "Endelea",
  "dash.streak": "siku mfululizo",
  "study.lesson": "Somo",
  "study.cards": "Kadi",
  "study.quiz": "Jaribio",
  "study.start": "Anza",
  "study.next": "Inayofuata",
  "study.previous": "Iliyotangulia",
  "study.flip": "Bofya kugeuza",
  "study.submit": "Wasilisha",
  "study.scored": "Umeipata",
  "study.tryAgain": "Jaribu tena",
  "study.mastered": "Hongera! Umekuwa bwana wa mada hii",
  "study.planAI": "Panga na AI",
  "common.loading": "Inapakia…",
  "common.error": "Hitilafu imetokea",
  "common.cancel": "Ghairi",
  "common.save": "Hifadhi",
  "common.delete": "Futa",
  "common.close": "Funga",
  "common.back": "Nyuma",
  "common.continue": "Endelea",
  "common.locked": "Imefungwa",
  "common.comingSoon": "Inakuja hivi karibuni",
  "common.topics": "mada",
};

const fr: Dict = {
  "nav.home": "Accueil",
  "nav.search": "Rechercher",
  "nav.progress": "Progrès",
  "nav.profile": "Profil",
  "nav.calendar": "Calendrier",
  "nav.exams": "Examens",
  "nav.children": "Mes Enfants",
  "nav.create": "Créer",
  "auth.signup": "Créer un compte",
  "auth.signin": "Se connecter",
  "auth.welcome": "Bon retour",
  "auth.create": "Créez votre compte",
  "auth.email": "Email",
  "auth.password": "Mot de passe",
  "auth.name": "Nom (optionnel)",
  "auth.phone": "Numéro de téléphone",
  "auth.forgot": "Mot de passe oublié?",
  "auth.verify": "Vérifiez votre email",
  "auth.verifyCode": "Entrez le code envoyé",
  "auth.verifyBtn": "Vérifier",
  "auth.resend": "Pas reçu? Renvoyer",
  "landing.student": "Je suis Étudiant",
  "landing.school": "Étudiant Scolaire",
  "landing.parent": "Je suis Parent (Family Mode)",
  "dash.greeting.morning": "Bonjour",
  "dash.greeting.afternoon": "Bon après-midi",
  "dash.greeting.evening": "Bonsoir",
  "dash.subjects": "matières",
  "dash.tapToStart": "Touchez une matière pour commencer",
  "dash.continue": "Continuez où vous étiez",
  "dash.resume": "Continuer",
  "dash.streak": "jours de suite",
  "study.lesson": "Leçon",
  "study.cards": "Cartes",
  "study.quiz": "Quiz",
  "study.start": "Commencer",
  "study.next": "Suivant",
  "study.previous": "Précédent",
  "study.flip": "Touchez pour retourner",
  "study.submit": "Soumettre",
  "study.scored": "Vous avez obtenu",
  "study.tryAgain": "Réessayer",
  "study.mastered": "Excellent! Vous maîtrisez ce sujet",
  "study.planAI": "Planifier avec IA",
  "common.loading": "Chargement…",
  "common.error": "Une erreur s'est produite",
  "common.cancel": "Annuler",
  "common.save": "Enregistrer",
  "common.delete": "Supprimer",
  "common.close": "Fermer",
  "common.back": "Retour",
  "common.continue": "Continuer",
  "common.locked": "Verrouillé",
  "common.comingSoon": "Bientôt disponible",
  "common.topics": "sujets",
};

const dicts: Record<Lang, Dict> = { en, sw, fr };

/**
 * Translate a key for the given language.
 * Falls back to English if the key isn't found in the target language.
 */
export function t(key: string, lang: Lang = "en"): string {
  return dicts[lang]?.[key] ?? dicts.en[key] ?? key;
}

/**
 * Get the user's preferred UI language from localStorage or browser.
 */
export function getUILang(): Lang {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem("studybuddy_ui_lang");
  if (stored === "sw" || stored === "fr" || stored === "en") return stored;
  // Auto-detect from browser
  const browser = navigator.language.toLowerCase();
  if (browser.startsWith("sw")) return "sw";
  if (browser.startsWith("fr")) return "fr";
  return "en";
}

/**
 * Set the user's preferred UI language.
 */
export function setUILang(lang: Lang): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("studybuddy_ui_lang", lang);
  }
}
