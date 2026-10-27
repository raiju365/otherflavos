// Theme input commits synchronously. No full-page snapshots, animated masks,
// queued captures or delayed callbacks compete with the local menu animation.
export function createThemeReveal({signal,apply}) {
  return theme=>{
    if(!signal.aborted&&document.documentElement.dataset.theme!==theme)apply(theme);
  };
}