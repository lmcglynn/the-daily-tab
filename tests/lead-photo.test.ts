import {
  asLeadPhoto,
  chooseLeadPhoto,
  chosenLeadPhoto,
  leadPhotoCandidates,
  photosToMeasure,
} from '@/lib/lead-photo';
import { item } from './helpers';

const pic = (name: string) => `https://img.example/${name}.jpg`;

describe('lead photo candidates', () => {
  const lead = item({ id: 'l', feedId: 'a', imageUrl: pic('small') });
  const related = [
    item({ id: 'r1', feedId: 'b', imageUrl: pic('big') }),
    item({ id: 'r2', feedId: 'c' }), // no picture
    item({ id: 'r3', feedId: 'd', imageUrl: pic('small') }), // the same agency photo
    item({ id: 'r4', feedId: 'e', imageUrl: pic('logo') }),
  ];

  it('takes the lead’s own picture first, then each other outlet’s, once', () => {
    expect(leadPhotoCandidates(lead, related, [])).toEqual([pic('small'), pic('big'), pic('logo')]);
  });

  it('leaves out a stock picture other stories on the page carry too', () => {
    const other = item({ id: 'x', feedId: 'e', imageUrl: pic('logo') });
    expect(leadPhotoCandidates(lead, related, [lead, ...related, other])).toEqual([
      pic('small'),
      pic('big'),
    ]);
  });
});

describe('choosing the largest', () => {
  const candidates = [pic('own'), pic('wide'), pic('square')];

  it('measures only when there’s a choice, and each picture once per lead', () => {
    expect(photosToMeasure(null, 'l', [pic('own')])).toEqual([]);
    expect(photosToMeasure(null, 'l', candidates)).toEqual(candidates);
    const stored = { itemId: 'l', url: pic('own'), size: 600, tried: [pic('own'), pic('wide')] };
    expect(photosToMeasure(stored, 'l', candidates)).toEqual([pic('square')]);
    // A new lead starts over.
    expect(photosToMeasure(stored, 'other', candidates)).toEqual(candidates);
  });

  it('goes by the shorter side, ignoring pictures that didn’t load', () => {
    const chosen = chooseLeadPhoto(null, 'l', candidates, [
      { url: pic('own'), width: 640, height: 360 },
      { url: pic('wide'), width: 1600, height: 500 },
      { url: pic('square'), width: 900, height: 900 },
    ]);
    expect(chosen).toEqual({ itemId: 'l', url: pic('square'), size: 900, tried: candidates });
    // A broken own picture loses to anything that loads; nothing loading chooses nothing.
    expect(
      chooseLeadPhoto(null, 'l', candidates, [
        { url: pic('own'), width: 0, height: 0 },
        { url: pic('wide'), width: 800, height: 450 },
      ])!.url,
    ).toBe(pic('wide'));
    expect(chooseLeadPhoto(null, 'l', candidates, [{ url: pic('own'), width: 0, height: 0 }])).toBe(
      null,
    );
  });

  it('keeps the earlier choice unless a newly measured picture beats it; ties stay with the lead’s own', () => {
    const stored = { itemId: 'l', url: pic('wide'), size: 500, tried: [pic('own'), pic('wide')] };
    const next = chooseLeadPhoto(stored, 'l', candidates, [
      { url: pic('square'), width: 480, height: 480 },
    ]);
    expect(next).toEqual({ ...stored, tried: candidates });
    expect(
      chooseLeadPhoto(null, 'l', candidates, [
        { url: pic('wide'), width: 900, height: 600 },
        { url: pic('own'), width: 600, height: 600 },
      ])!.url,
    ).toBe(pic('own'));
  });

  it('applies a remembered choice only to its lead, while that picture is still one of its own', () => {
    const stored = { itemId: 'l', url: pic('square'), size: 900, tried: candidates };
    expect(chosenLeadPhoto(stored, 'l', candidates)).toBe(pic('square'));
    expect(chosenLeadPhoto(stored, 'other', candidates)).toBeUndefined();
    expect(chosenLeadPhoto(stored, 'l', [pic('own')])).toBeUndefined();
    expect(asLeadPhoto(stored)).toBe(stored);
    expect(asLeadPhoto({ itemId: 'l' })).toBeNull();
    expect(asLeadPhoto(undefined)).toBeNull();
  });
});
