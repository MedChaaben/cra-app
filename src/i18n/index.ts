import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const resources = {
  fr: {
    translation: {
      appName: 'CRA Studio',
      nav: {
        dashboard: 'Tableau de bord',
        import: 'Importer',
        invoices: 'Factures',
        settings: 'Réglages',
      },
      auth: {
        login: 'Connexion',
        signup: 'Créer un compte',
        email: 'Email',
        password: 'Mot de passe',
        logout: 'Déconnexion',
      },
      dashboard: {
        title: 'Vue d’ensemble',
        subtitle: 'Suivez vos feuilles, heures et facturation du mois.',
        timesheets: 'Feuilles',
        invoices: 'Factures',
        hoursMonth: 'Heures (mois)',
        revenueMonth: 'CA HT (mois)',
        emptyTimesheets: 'Aucune feuille pour l’instant',
        emptyInvoices: 'Aucune facture générée',
      },
      import: {
        title: 'Importer une feuille',
        subtitle: 'Photo, capture ou fichier — nous extrayons le tableau.',
        drop: 'Glissez une image ou cliquez pour parcourir',
        camera: 'Caméra',
        crop: 'Recadrer',
        contrast: 'Contraste auto',
        runOcr: 'Lancer l’OCR',
        preview: 'Aperçu texte',
      },
      editor: {
        title: 'Édition',
        addRow: 'Ajouter une ligne',
        save: 'Enregistrer',
        invoice: 'Facturer',
      },
      invoices: {
        title: 'Factures',
        new: 'Nouvelle facture',
      },
      settings: {
        title: 'Réglages',
        profile: 'Profil société',
        demo: 'Données démo',
        demoBtn: 'Charger données démo',
      },
    },
  },
  en: {
    translation: {
      appName: 'CRA Studio',
      nav: {
        dashboard: 'Dashboard',
        import: 'Import',
        invoices: 'Invoices',
        settings: 'Settings',
      },
      auth: {
        login: 'Sign in',
        signup: 'Create account',
        email: 'Email',
        password: 'Password',
        logout: 'Log out',
      },
      dashboard: {
        title: 'Overview',
        subtitle: 'Track timesheets, hours and monthly billing.',
        timesheets: 'Timesheets',
        invoices: 'Invoices',
        hoursMonth: 'Hours (month)',
        revenueMonth: 'Revenue ex. VAT',
        emptyTimesheets: 'No timesheets yet',
        emptyInvoices: 'No invoices yet',
      },
      import: {
        title: 'Import a timesheet',
        subtitle: 'Photo, screenshot or file — we extract the table.',
        drop: 'Drop an image or click to browse',
        camera: 'Camera',
        crop: 'Crop',
        contrast: 'Auto contrast',
        runOcr: 'Run OCR',
        preview: 'Text preview',
      },
      editor: {
        title: 'Edit',
        addRow: 'Add row',
        save: 'Save',
        invoice: 'Invoice',
      },
      invoices: {
        title: 'Invoices',
        new: 'New invoice',
      },
      settings: {
        title: 'Settings',
        profile: 'Company profile',
        demo: 'Demo data',
        demoBtn: 'Load demo data',
      },
    },
  },
} as const

void i18n.use(initReactI18next).init({
  resources,
  lng: 'fr',
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
})

export default i18n
