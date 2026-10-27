// Edit this file to add your real identity and projects.
// Missing links stay null; no fictional client, experience, or achievement is used.
export const profile = {
  name: 'Fahmi Aufa',
  handle: 'Flavos',
  role: 'art enthusiast',
  chapters: {
    home: { label: '01 / A DIGITAL NOTEBOOK', lines: ['Ideas, made', 'for the web.'] },
    projects: { label: '02 / SELECTED EXPLORATIONS', lines: ['Selected work.', 'Considered details.'] },
    more: { label: '03 / A PERSONAL PERSPECTIVE', lines: ['The person', 'behind the pixels.'] },
  },
  intro: {
    home: ['a personal space for <strong>websites, web apps,</strong> and the ideas behind them.', 'made with care. always a work in progress.'],
    projects: ['selected work in <strong>interface design, frontend development,</strong> and interactive experiences.'],
    more: ['a little more about <strong>the person behind the work.</strong>'],
  },
  currently: '[Apa yang sedang kamu kerjakan, pelajari, atau eksplorasi saat ini.]',
  // Dummy About copy, approved as a temporary layout preview. Replace these
  // fields with your own biography, then set aboutIsDraft to false.
  aboutIsDraft: true,
  aboutStatement: 'Fahmi Aufa is an art enthusiast exploring visual design and the web.',
  about: [
    'An interest in art shapes the way I look at the web: a space for clear ideas, considered details, and interactions that feel natural.',
    'I’m drawn to the meeting point between interface design and frontend development, where visual decisions become something people can explore and use.',
    'This portfolio brings together websites, web apps, and experiments. Each project has room for the process behind it — the choices, the challenges, and the things learned along the way.',
  ],
  email: null,
  socials: [
    { label: 'github', handle: 'raiju365', url: 'https://github.com/raiju365' },
    {
      label: 'linkedin', handle: 'Fahmi Aufa', url: 'https://www.linkedin.com/in/fahmiaufa513/'
    },
    {
      label: 'instagram', handle: 'aufhmiiii', url: 'https://www.instagram.com/aufhmiiii/'
    },
  ],
};

// preview is optional. Replace the local scroll studies with your real full-page
// capture (motion: 'scroll') or a poster + video path. Keep video null if unavailable.
// image remains the separate screenshot used by Now and the project detail.
export const projects = [
  {
    id: 'website', name: '[nama website]', type: 'website / frontend', status: 'placeholder',
    preview: { image: '/projects/website-scroll.svg', width: 1440, height: 1800, motion: 'scroll', video: null },
    image: '/projects/website.svg', alt: 'Website screenshot placeholder — replace with your actual project',
    description: '[Deskripsi singkat website: tujuannya, kebutuhan pengguna, dan apa yang kamu bangun.]',
    role: '[peranmu dalam proyek]', technologies: ['[teknologi 1]', '[teknologi 2]'],
    decision: '[Keputusan desain atau teknis yang kamu ambil, beserta alasannya.]',
    liveUrl: null, sourceUrl: null,
  },
  {
    id: 'web-app', name: '[nama web app]', type: 'web application', status: 'placeholder',
    preview: { image: '/projects/webapp-scroll.svg', width: 1440, height: 1800, motion: 'scroll', video: null },
    image: '/projects/webapp.svg', alt: 'Web application screenshot placeholder — replace with your actual project',
    description: '[Deskripsi aplikasi web, fitur utamanya, dan masalah yang ingin diselesaikan.]',
    role: '[peranmu dalam proyek]', technologies: ['[teknologi 1]', '[teknologi 2]'],
    decision: '[Alasan di balik arsitektur, interaksi, atau pilihan teknologinya.]',
    liveUrl: null, sourceUrl: null,
  },
  {
    id: 'experiment', name: '[nama eksperimen]', type: 'creative development', status: 'placeholder',
    preview: { image: '/projects/experiment-scroll.svg', width: 1440, height: 1800, motion: 'scroll', video: null },
    image: '/projects/experiment.svg', alt: 'Creative web experiment placeholder — replace with your actual project',
    description: '[Eksplorasi antarmuka atau interaksi yang pernah kamu buat.]',
    role: '[peranmu dalam proyek]', technologies: ['[teknologi]'],
    decision: '[Apa yang kamu eksplorasi dan apa yang kamu pelajari dari prosesnya.]',
    liveUrl: null, sourceUrl: null,
  },
];
