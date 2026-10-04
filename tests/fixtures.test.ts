import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { capturePage } from '../packages/shared/src/capture';
it.each([
  ['apartment-1.html', 'Garneau Place'],
  ['hotel.html', 'Harbour Hotel'],
  ['job.html', 'Python engineer'],
  ['product.html', 'Field Laptop'],
  ['messy.html', 'Parking included.'],
  ['without-jsonld.html', 'CAD 1100'],
])(
  'captures the %s fixture without private or irrelevant content',
  (file, expected) => {
    const html = readFileSync(
      `${process.cwd()}/tests/fixtures/${file}`,
      'utf8',
    );
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    document.head.innerHTML = parsed.head.innerHTML;
    document.body.innerHTML = parsed.body.innerHTML;
    const result = capturePage();
    expect(result.cleanedText).toContain(expected);
    expect(result.cleanedText).not.toContain('DO_NOT_CAPTURE');
    expect(result.cleanedText).not.toContain('Ignore footer');
  },
);
