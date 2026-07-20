const form = document.getElementById('lookupForm');
const button = document.getElementById('lookupButton');
const message = document.getElementById('lookupMessage');
const results = document.getElementById('results');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}

function customerFacingText(value, fallback = 'See registered warranty record') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  const translated = text
    .replaceAll('\u7a97\u819c', 'Window Tint')
    .replaceAll('\u6539\u8272\u819c', 'Color Change Film')
    .replaceAll('\u6f06\u9762\u4fdd\u62a4\u819c', 'Paint Protection Film')
    .replaceAll('\u5168\u8f66', 'Full Vehicle')
    .replaceAll('\u524d\u4fdd\u9669\u6760', 'Front Bumper')
    .replaceAll('\u5f15\u64ce\u76d6', 'Hood')
    .replaceAll('\u5de6\u53f6\u5b50\u677f', 'Left Fender')
    .replaceAll('\u53f3\u53f6\u5b50\u677f', 'Right Fender')
    .replaceAll('\u8f66\u95e8', 'Doors')
    .replaceAll('\u540e\u89c6\u955c', 'Mirrors')
    .replaceAll('\u8f66\u9876', 'Roof')
    .replaceAll('\u4fa7\u88d9', 'Rocker Panels')
    .replaceAll('\u540e\u5907\u7bb1\u76d6', 'Trunk Lid')
    .replaceAll('\u57fa\u672c\u6b3e', 'Standard')
    .replaceAll('\u5b9a\u5236\u6b3e', 'Custom')
    .replaceAll('\u81ea\u4f9b\u819c', 'Customer-Supplied Film');
  return /[\u3400-\u9fff]/u.test(translated) ? fallback : translated;
}

function warrantyYears(start, end) {
  if (!start || !end) return 'See electronic warranty record';
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 'See electronic warranty record';
  const years = Math.max(0, Math.round(((endDate - startDate) / (365.2425 * 24 * 60 * 60 * 1000)) * 10) / 10);
  return `${years} ${years === 1 ? 'year' : 'years'}`;
}

function warrantyNumber(id) {
  const compact = String(id || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return compact ? `QF-${compact.slice(-10)}` : 'See electronic warranty record';
}

function policyItem(title, text) {
  return `<div class="policy-item"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(text)}</p></div>`;
}

function numberedList(items) {
  return `<ol class="policy-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`;
}

function exclusionGroup(title, items) {
  return `<div class="exclusion-group"><h4>${escapeHtml(title)}</h4>${numberedList(items)}</div>`;
}

function scrollWarrantySection(cardId, sectionId) {
  document.getElementById(`${cardId}-${sectionId}`)?.scrollIntoView({ behavior:'smooth', block:'start' });
}

function confirmWarrantyRead(cardId, control) {
  const confirmed = control.getAttribute('aria-pressed') !== 'true';
  control.setAttribute('aria-pressed', String(confirmed));
  control.classList.toggle('confirmed', confirmed);
  control.textContent = confirmed ? '✓ I have read and understand the warranty coverage' : 'I have read and understand the warranty coverage';
  const note = document.getElementById(`${cardId}-read-note`);
  if (note) note.textContent = confirmed ? 'This acknowledgment is stored only on this page. It does not submit a claim or change the warranty status.' : '';
}

function warrantyCard(item, index) {
  const today = new Date().toISOString().slice(0, 10);
  const expired = Boolean(item.warrantyUntil && item.warrantyUntil < today);
  const cardId = `warranty-${index}-${String(item.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8)}`;
  const status = expired ? 'Expired' : 'Active';
  const startDate = item.installDate || 'Not registered';
  const endDate = item.warrantyUntil || 'See electronic warranty record';
  const product = customerFacingText(item.product, 'Not registered');
  const vehicle = customerFacingText(item.vehicle, 'Not registered');
  const plate = customerFacingText(item.licensePlate, 'Not registered');
  const photos = Array.isArray(item.photos) ? item.photos : [];

  return `<article class="warranty-detail" id="${cardId}">
    <section class="warranty-summary" id="${cardId}-vehicle">
      <div class="summary-title-row">
        <div><span class="summary-eyebrow">QUAD FILM LIMITED WARRANTY</span><h2>QUAD FILM Paint Protection Film Limited Warranty</h2></div>
        <span class="status-badge ${expired ? 'expired' : ''}">${escapeHtml(status)}</span>
      </div>
      <div class="summary-grid">
        <div><span>Warranty Product</span><strong>${escapeHtml(product)}</strong></div>
        <div><span>Warranty Term</span><strong>${escapeHtml(warrantyYears(item.installDate, item.warrantyUntil))}</strong></div>
        <div><span>Warranty Dates</span><strong>${escapeHtml(startDate)} to ${escapeHtml(endDate)}</strong></div>
        <div><span>Warranty Number</span><strong>${escapeHtml(warrantyNumber(item.id))}</strong></div>
        <div><span>Vehicle VIN</span><strong>Not registered</strong></div>
        <div><span>Installing Store</span><strong>QUAD FILM</strong></div>
        <div><span>Warranty Status</span><strong>${escapeHtml(status)}</strong></div>
        <div><span>Covered Vehicle</span><strong>${escapeHtml(vehicle)} · ${escapeHtml(plate)}</strong></div>
      </div>
      <div class="limited-warranty-notice">This is a limited warranty for defects in product materials and manufacturing. It primarily covers abnormal yellowing, film cracking, material-related bubbling, and delamination. It is not insurance for vehicle accidents, scratches, rock impacts, or other external damage.</div>
      <div class="registered-detail"><div><span>Registered Installation Areas</span><p>${escapeHtml(customerFacingText(item.areas, 'Not registered'))}</p></div><div><span>Electronic Warranty Notes</span><p>${escapeHtml(customerFacingText(item.warrantyContent, 'Subject to the warranty policy shown on this page'))}</p></div></div>
      ${photos.length ? `<div class="warranty-photos" id="${cardId}-installation"><h3>Covered Vehicle and Installation Photos</h3><div>${photos.map(photo => `<a href="${escapeHtml(photo.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(customerFacingText(photo.name, 'Vehicle installation photo'))}" loading="lazy" /></a>`).join('')}</div></div>` : `<div id="${cardId}-installation" class="no-photo-note">No installation photos have been uploaded for this warranty record.</div>`}
      <div class="detail-actions">
        <button type="button" class="primary-action" onclick="scrollWarrantySection('${cardId}','application')">Apply for Warranty Service</button>
        <button type="button" class="secondary-action" onclick="scrollWarrantySection('${cardId}','vehicle')">View Covered Vehicle</button>
        <button type="button" class="secondary-action" onclick="scrollWarrantySection('${cardId}','installation')">View Installation Information</button>
      </div>
    </section>

    <div class="policy-grid">
      <section class="policy-section" id="${cardId}-coverage"><span class="section-number">01</span><h3>Warranty Coverage</h3>
        <p>Coverage begins when the product is first installed and its warranty is successfully activated. During the warranty term, the product must be installed by a professional shop according to installation standards and used under normal automotive and maintenance conditions.</p>
        <p>If a material or manufacturing defect causes any of the following conditions, an approved claim may be handled under this policy.</p>
        <div class="policy-items">
          ${policyItem('Abnormal Yellowing','Clearly abnormal yellowing, discoloration, or loss of transparency beyond the product’s normal aging characteristics.')}
          ${policyItem('Film Cracking or Crazing','Abnormal cracking or crazing when there has been no collision, rock impact, cutting, scratching, chemical corrosion, or other external damage.')}
          ${policyItem('Material-Related Bubbling','Bubbles caused by an abnormality in the film, adhesive layer, or composite structure. Moisture left during installation, debris under the film, paint outgassing, refinished-paint issues, or improper installation are not covered as material defects.')}
          ${policyItem('Delamination','Abnormal separation between the surface coating, film substrate, or adhesive layer, including large-area interlayer separation.')}
        </div>
      </section>

      <section class="policy-section" id="${cardId}-conditions"><span class="section-number">02</span><h3>Warranty Eligibility Requirements</h3><p>All of the following conditions must be met:</p>
        ${numberedList([
          'The product is genuine QUAD FILM and has a valid roll number, batch number, authenticity code, or warranty record.',
          'The warranty has been activated and is linked to the correct vehicle VIN, product model, and installing store.',
          'The product was installed by a professional shop according to brand installation standards.',
          'The affected vehicle area is included in the installation coverage registered on the original warranty.',
          'The product is within its valid warranty term.',
          'The vehicle has been used normally and cleaned and maintained in a reasonable manner.',
          'The customer can provide the warranty number, vehicle information, installation records, and photos or video showing the issue.',
          'The product has not been removed, replaced, cut, repaired, or reinstalled without authorization.'
        ])}
      </section>

      <section class="policy-section" id="${cardId}-installation-quality"><span class="section-number">03</span><h3>Installation Workmanship Issues</h3>
        <p>Product material coverage and installation workmanship coverage are evaluated separately.</p><p>If inspection confirms that an issue was caused by installation, it is generally treated as a workmanship issue and handled by the original installing store under its workmanship policy:</p>
        ${numberedList(['Lifted film edges or failed wrapped edges.','Residual installation moisture or water pockets.','Visible dust, hair, or other installation debris under the film.','Seams, edge wrapping, or cutting that does not meet the agreed installation standard.','Film texture, adhesive marks, or distortion caused by improper stretching.','Paint cuts caused during installation.','Vehicle component damage, noise, or improper reassembly caused by installation disassembly or reassembly.','Localized lifting, unsecured edges, or missed areas shortly after installation.'])}
        <p class="section-conclusion">If review confirms that the issue was caused by the film material, adhesive layer, or a manufacturing defect, it will be handled under the product material warranty.</p>
      </section>

      <section class="policy-section policy-section-wide" id="${cardId}-exclusions"><span class="section-number">04</span><h3>What Is Not Covered</h3><p>The following conditions are generally not covered as product material or manufacturing defects.</p>
        <div class="exclusion-grid">
          ${exclusionGroup('Accidents and External Damage',['Traffic accidents, collisions, or vehicle scrapes.','Impacts from rocks, road debris, or other objects.','Scratches, cuts, or punctures caused by keys, knives, branches, or other sharp objects.','Intentional damage, vandalism, or animal damage.','Damage caused by cargo, luggage, doors, or other objects rubbing against or striking the vehicle.','Film damage during vehicle repair, bodywork, painting, or disassembly.'])}
          ${exclusionGroup('Contamination and Environmental Damage',['Corrosion or staining caused by prolonged contact with bird droppings, insects, tree sap, tar, paint, cement, iron particles, or industrial contaminants.','Water spots, mineral deposits, or corrosion caused by hard water, groundwater, acid rain, or mineral buildup.','Damage caused by fire, flood, hail, extreme heat, or other natural disasters.','Damage caused by chemicals, fuel, brake fluid, solvents, or other corrosive substances.'])}
          ${exclusionGroup('Improper Washing and Maintenance',['Use of strong acids, strong alkalis, strong solvents, or cleaners not intended for paint protection film.','Use of hard brushes, abrasive tools, sandpaper, or other tools that may damage the film.','Using a pressure washer too close to film edges, causing lifting or water intrusion.','Damage caused by automatic car-wash equipment or mechanical brushes.','Improper polishing, abrasion, adhesive removal, coating, or detailing procedures.','Prolonged direct heating with steam, a heat gun, or other high-temperature equipment.'])}
          ${exclusionGroup('Normal Wear and Aging',['Minor scratches, small rock-impact marks, or surface wear from normal use.','Gradual reduction in gloss, hydrophobicity, self-cleaning performance, or surface smoothness.','Gradual reduction in self-healing speed or performance as the product ages.','Normal dirt buildup along film edges or surface contamination removable by normal cleaning.','Minor color change that does not meet the standard for abnormal yellowing.'])}
          ${exclusionGroup('Vehicle Paint Conditions',['Non-original paint, repainted areas, touch-up paint, or repaired body panels.','Paint, clear coat, or primer with poor adhesion, cracking, oxidation, bubbling, or chalking.','Installation before the vehicle paint is fully cured.','Paint lifting during film removal due to original or refinished paint quality.','Pre-existing scratches, dents, color differences, corrosion, or other paint conditions.'])}
          ${exclusionGroup('Unauthorized Work',['Unauthorized removal, patching, replacement, or reinstallation of the product.','Unauthorized cutting, spraying, sanding, polishing, or chemical treatment.','Film damage caused by third-party vehicle repairs.','Inability to verify the original product model, batch, installation coverage, or warranty record.'])}
        </div>
      </section>

      <section class="policy-section" id="${cardId}-resolution"><span class="section-number">05</span><h3>Warranty Resolution</h3>
        ${numberedList(['After a claim is submitted, the installing store or brand service team will inspect the issue.','The brand may request additional vehicle photos, close-up photos, video, installation records, purchase receipts, or repair records.','If a product material or manufacturing defect is confirmed, the brand will provide repair or replacement according to the nature of the issue.','Resolution is generally limited to the affected film piece or vehicle body panel and does not automatically include full-vehicle replacement.','When a covered issue affects one vehicle area, the paint protection film on that area will generally be replaced.','If a systemic issue involving the same batch or roll is confirmed, the brand may expand the inspection or resolution scope.','Approved service may include replacement material and reasonable removal, adhesive cleanup, and reinstallation for the affected area.','Component removal, transportation, customer travel, vehicle downtime, substitute transportation, and other incidental costs are not covered unless expressly stated otherwise.','If the original product is discontinued or unavailable, it may be replaced with a product of equal or better performance and warranty level.','After replacement, the system should record the replaced area, replacement date, new product model, roll number, batch number, and servicing store.','The warranty term after replacement is governed by applicable law, this policy, and the electronic warranty record.'])}
      </section>

      <section class="policy-section" id="${cardId}-application"><span class="section-number">06</span><h3>Required Claim Information</h3><p>Please prepare the following information when requesting warranty service:</p>
        ${numberedList(['Electronic warranty number.','Phone number registered with the warranty.','Vehicle VIN.','Product receipt, installation order, or payment record.','Full-vehicle photos.','Wide-angle photos of the affected area.','Clear close-up photos of the affected area.','Video clearly showing the issue.','Date the issue was first noticed and a description of the issue.','A statement about any accident, repair, repainting, or paint touch-up involving the vehicle.','A statement about any removal, repair, patching, or reinstallation performed by another shop.'])}
        <p class="section-conclusion">The brand may request other reasonable information based on the specific issue.</p>
        <div class="claim-flow-note"><strong>Apply for Warranty Service</strong><p>Please submit the information above through the existing warranty claim process. This detail page does not automatically create a claim or change the current warranty status.</p></div>
      </section>
    </div>

    <section class="important-notice"><h3>Important Notice</h3>${numberedList(['This is a limited warranty for defects in paint protection film materials and manufacturing. It is not vehicle insurance or accidental-damage coverage.','Film damage caused by accidents, collisions, scrapes, rock impacts, sharp objects, or other external forces is not covered by the basic product warranty.','Self-healing, stain resistance, hydrophobicity, impact resistance, and wear resistance do not mean that every scratch, contaminant, or reduction in performance qualifies for free replacement.','Only abnormal yellowing, film cracking, material-related bubbling, and delamination expressly listed in this policy are covered by the basic product warranty.','Coverage decisions are based on the product condition, physical inspection, installation records, vehicle paint condition, and other relevant evidence.','This warranty does not exclude or limit any rights available to consumers under applicable law.'])}
      <button type="button" class="read-confirm" aria-pressed="false" onclick="confirmWarrantyRead('${cardId}',this)">I have read and understand the warranty coverage</button><p id="${cardId}-read-note" class="read-note"></p>
    </section>
    <section class="status-copy"><h3>Claim Status Messages</h3><details><summary>Claim Submitted</summary><p>Your warranty claim has been submitted. The service team will review the vehicle, product, and issue information you provided. Please check the warranty system for updates.</p></details><details><summary>Additional Information Required</summary><p>There is not enough information to complete the warranty review. Please provide clear photos or video of the affected area and any relevant installation records.</p></details><details><summary>Not Covered</summary><p>After review, the current issue does not qualify as a product material or manufacturing defect. Please review the stated reason. If you disagree, you may submit additional supporting information for reconsideration.</p></details><details><summary>Warranty Approved</summary><p>The issue meets the warranty requirements. Please follow the system instructions and visit the designated store for inspection, repair, or replacement.</p></details></section>
  </article>`;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  message.textContent = '';
  results.hidden = true;
  results.innerHTML = '';
  button.disabled = true;
  button.textContent = 'Looking up…';
  try {
    const response = await fetch('/api/warranty/lookup', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ name:document.getElementById('customerName').value, phone:document.getElementById('phone').value })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'The warranty lookup failed. Please try again later.');
    if (!(body.warranties || []).length) {
      message.textContent = 'No matching warranty record was found. Check the registered name and phone number or contact the QUAD FILM store.';
      return;
    }
    results.innerHTML = body.warranties.map(warrantyCard).join('');
    results.hidden = false;
    results.scrollIntoView({ behavior:'smooth', block:'start' });
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Look Up Warranty';
  }
});
