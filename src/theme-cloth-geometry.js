// Superseded cloth study, retained only for historical fixture checks.
// Matching cubic commands keep the withdrawing color edge continuously curved.
export function themePullGeometry({ x, y, width: w, height: h }) {
  const m = 24;
  const shapes = [
    [[-m,-m],[w+m,-m],[w+m,h*.25],[w+m,h*.75],[w+m,h+m],[-m,h+m],[-m,h*.75],[-m,h*.25],[-m,-m]],
    [[-m,-m],[w*.62,-m],[w*.2,h*.16],[w*.98,h*.68],[w*.8,h+m],[-m,h+m],[-m,h*.75],[-m,h*.25],[-m,-m]],
    [[-m,h*.24],[w*.14,h*.34],[w*.42,h*.45],[w*.5,h*.85],[w*.14,h+m],[-m,h+m],[-m,h*.9],[-m,h*.5],[-m,h*.24]],
    [[x-24,y-92],[x+12,y-82],[x+90,y-54],[x+44,y+36],[x-2,y+20],[x-24,y+20],[x-38,y+10],[x-32,y-38],[x-24,y-92]],
    Array.from({ length: 9 }, () => [x,y]),
  ];
  return shapes.map((points, index) => ({
    offset: [0,.32,.68,.9,1][index],
    points,
    opacity: index === 4 ? 0 : 1,
  }));
}
export function themePullFrames(settings) {
  return themePullGeometry(settings).map(({ points, ...frame }) => {
    const p = points.map(point => point.map(value => Number(value.toFixed(2))).join(' '));
    return { ...frame, clipPath: `path("M ${p[0]} L ${p[1]} C ${p[2]} ${p[3]} ${p[4]} L ${p[5]} C ${p[6]} ${p[7]} ${p[8]} Z")` };
  });
}

