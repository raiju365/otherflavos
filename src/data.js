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

// Local recordings of the published sites, with posters for reduced motion and
// browsers that cannot play video or create the curved WebGL surface.
export const projects = [
  {
    id: 'otherflavos', name: 'Other Flavos', type: 'interactive portfolio', status: 'live',
    preview: { image: '/projects/otherflavos.webp', width: 1152, height: 720, video: '/projects/otherflavos.mp4' },
    image: '/projects/otherflavos.webp', alt: 'Other Flavos portfolio with Untangle, Conduit and Shift on the Play page',
    description: 'A personal portfolio with three playable puzzles, a curved project gallery and an About page. The walkthrough opens Shift, moves a tile and rotates its wooden board, then explores Conduit and About.',
    role: 'Personal project', technologies: ['HTML', 'CSS', 'JavaScript', 'Vite', 'WebGL'],
    decision: 'A fixed profile rail accompanies the Play, Projects and About panels. The project gallery maps each website recording onto a curved WebGL surface, with playback paused when the gallery is out of view.',
    liveUrl: 'https://otherflavos.vercel.app/', sourceUrl: 'https://github.com/raiju365/otherflavos',
  },
  {
    id: 'flavos', name: 'Flavos', type: 'visual portfolio', status: 'live',
    preview: { image: '/projects/flavos.webp', width: 1152, height: 720, video: '/projects/flavos.mp4' },
    image: '/projects/flavos.webp', alt: 'Flavos visual portfolio with classical artwork and expressive typography',
    description: 'A visual portfolio with classical artwork, a material-changing logo, a portrait section, an artwork gallery and an animated signature. The walkthrough follows the page from its opening through About, Work and Contact.',
    role: 'Personal project', technologies: ['HTML', 'CSS', 'JavaScript', 'Vite', 'GSAP', 'Three.js'],
    decision: 'Scroll transitions connect the artwork, logo and page sections. The Work gallery provides a separate view for each piece, while the Contact section closes with a reflective three-dimensional signature.',
    liveUrl: 'https://flavos-dusky.vercel.app/', sourceUrl: 'https://github.com/raiju365/flavos',
  },
];
