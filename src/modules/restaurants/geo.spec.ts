import { boundingBox, likePattern } from './geo';

describe('boundingBox', () => {
  const london = { latitude: 51.5074, longitude: -0.1278 };

  it('grows with the radius', () => {
    const small = boundingBox(london, 1);
    const large = boundingBox(london, 10);

    expect(large.maxLat - large.minLat).toBeGreaterThan(small.maxLat - small.minLat);
  });

  it('contains every point inside the radius', () => {
    const box = boundingBox(london, 5);

    // 5km north, south, east and west must all fall inside the box.
    const kmPerDegreeLat = 111.045;
    const north = london.latitude + 5 / kmPerDegreeLat;
    const south = london.latitude - 5 / kmPerDegreeLat;

    expect(north).toBeLessThanOrEqual(box.maxLat);
    expect(south).toBeGreaterThanOrEqual(box.minLat);
    expect(box.minLng).toBeLessThan(london.longitude);
    expect(box.maxLng).toBeGreaterThan(london.longitude);
  });

  it('widens the longitude span as latitude increases', () => {
    // Lines of longitude converge toward the poles, so the same distance east
    // covers more degrees the further north you go.
    const equator = boundingBox({ latitude: 0, longitude: 0 }, 10);
    const arctic = boundingBox({ latitude: 70, longitude: 0 }, 10);

    expect(arctic.maxLng - arctic.minLng).toBeGreaterThan(equator.maxLng - equator.minLng);
  });

  it('does not blow up at the pole', () => {
    // cos(90°) is 0; dividing by it would produce Infinity and poison the query.
    const box = boundingBox({ latitude: 90, longitude: 0 }, 10);

    expect(Number.isFinite(box.minLng)).toBe(true);
    expect(Number.isFinite(box.maxLng)).toBe(true);
    expect(box.maxLng - box.minLng).toBeLessThanOrEqual(360);
  });
});

describe('likePattern', () => {
  it('wraps the term in wildcards', () => {
    expect(likePattern('sushi')).toBe('%sushi%');
  });

  it('neutralises wildcards the user typed', () => {
    // Unescaped, `%` would match every restaurant and `_` any single char.
    expect(likePattern('100%')).toBe('%100\\%%');
    expect(likePattern('a_b')).toBe('%a\\_b%');
  });

  it('escapes the escape character itself', () => {
    expect(likePattern('back\\slash')).toBe('%back\\\\slash%');
  });
});
