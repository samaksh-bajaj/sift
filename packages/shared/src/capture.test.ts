import { beforeEach, expect, it } from 'vitest';
import { capturePage } from './capture';
beforeEach(() => {
  document.head.innerHTML = '<title>Listing</title>';
  document.body.innerHTML = '';
});
it('removes forms, hidden text, navigation and repeated content', () => {
  document.body.innerHTML =
    '<nav>Menu</nav><main><h1>Home</h1><p>Rent CAD 1200</p><p>Rent CAD 1200</p><form>Secret<input value="password"></form><div style="display:none">Private</div><textarea>Draft message</textarea><div contenteditable>Private draft</div></main><footer>Footer</footer>';
  const d = capturePage();
  expect(d.cleanedText).toBe('Home\nRent CAD 1200');
});
it('preserves tables and structured data', () => {
  document.head.innerHTML +=
    '<script type="application/ld+json">{"price":1200}</script>';
  document.body.innerHTML =
    '<table><tr><th>Rent</th><td>1200</td></tr></table>';
  const d = capturePage();
  expect(d.jsonLd).toEqual([{ price: 1200 }]);
  expect(d.tables[0]?.rows[0]).toEqual(['Rent', '1200']);
});
it('bounds text while retaining relevant sections', () => {
  document.body.innerHTML = `<p>${'irrelevant '.repeat(100)}</p><h2>Parking included</h2>`;
  const d = capturePage(['parking'], 50);
  expect(d.cleanedText).toContain('Parking');
  expect(d.cleanedText.length).toBeLessThanOrEqual(50);
  expect(d.wasTruncated).toBe(true);
});
