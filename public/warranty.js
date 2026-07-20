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

function warrantyCategory(item) {
  if (['ppf', 'automotiveWindowFilm', 'vehicleColorChange', 'architecturalGlassFilm'].includes(item.productCategory)) return item.productCategory;
  const text = `${item.product || ''} ${item.productSeries || ''}`.toLowerCase();
  if (/architect|building/.test(text)) return 'architecturalGlassFilm';
  if (/window|tint/.test(text)) return 'automotiveWindowFilm';
  if (/wrap|color change/.test(text)) return 'vehicleColorChange';
  return 'ppf';
}

function summaryField(label, value) {
  const text = String(value || '').trim();
  return text ? `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(customerFacingText(text, text))}</strong></div>` : '';
}

function policySection(cardId, number, id, title, content, wide = false) {
  return `<section class="policy-section ${wide ? 'policy-section-wide' : ''}" id="${cardId}-${id}"><span class="section-number">${String(number).padStart(2, '0')}</span><h3>${escapeHtml(title)}</h3>${content}</section>`;
}

function claimInformation(items) {
  return `<p>Please prepare the following information when requesting warranty service:</p>${numberedList(items)}<p class="section-conclusion">The brand may request other reasonable information based on the specific issue.</p>`;
}

function ppfPolicy(cardId, colorPpf = false) {
  const coverage = [
    ['Abnormal Yellowing', 'Clearly abnormal yellowing, discoloration, or loss of transparency beyond normal product aging.'],
    ['Film Cracking or Crazing', 'Abnormal cracking or crazing without collision, rock impact, cutting, scratching, chemical corrosion, or other external damage.'],
    ['Material-Related Bubbling', 'Bubbles caused by an abnormality in the film, adhesive, or composite structure. Installation moisture, debris, paint outgassing, refinished paint, and improper installation are not material defects.'],
    ['Delamination', 'Abnormal separation between the surface coating, film substrate, or adhesive layer.']
  ];
  if (colorPpf) coverage.push(['Abnormal Fading or Color Change', 'Fading, color change, or uneven color clearly beyond normal aging and the applicable product warranty standard.']);
  return [
    policySection(cardId, 1, 'coverage', 'Warranty Coverage', `<p>Coverage applies when the product is professionally installed, activated, normally used, and reasonably maintained. Approved material or manufacturing defects may be handled under this policy.</p><div class="policy-items">${coverage.map(([a,b]) => policyItem(a,b)).join('')}</div>`),
    policySection(cardId, 2, 'conditions', 'Warranty Eligibility Requirements', numberedList(['Genuine QUAD FILM product with a valid roll, batch, authenticity, or warranty record.','Activated warranty linked to the correct VIN, product, and installing store.','Professional installation according to brand standards.','The affected area is included in the registered installation coverage.','The product remains within its warranty term.','Normal vehicle use and reasonable cleaning and maintenance.','Warranty number, vehicle information, installation records, and supporting photos or video can be provided.','No unauthorized removal, replacement, cutting, repair, or reinstallation.'])),
    policySection(cardId, 3, 'installation-quality', 'Installation Workmanship Issues', `<p>Material coverage and workmanship coverage are evaluated separately. The original installing store generally handles workmanship issues.</p>${numberedList(['Lifted edges or failed wrapped edges.','Residual installation moisture or water pockets.','Visible dust, hair, or installation debris.','Unacceptable seams, edge wrapping, or cutting.','Texture, adhesive marks, or distortion caused by improper stretching.','Paint cuts caused during installation.','Damage, noise, or improper reassembly caused by component removal.','Localized lifting, unsecured edges, or missed areas shortly after installation.'])}`),
    policySection(cardId, 4, 'exclusions', 'What Is Not Covered', `<div class="exclusion-grid">${exclusionGroup('Accidents and External Damage',['Accidents, collisions, scrapes, rocks, road debris, sharp objects, vandalism, animal damage, cargo contact, and repair-related damage.'])}${exclusionGroup('Contamination and Environment',['Bird droppings, insects, tree sap, tar, paint, cement, industrial fallout, hard water, acid rain, fire, flood, hail, extreme heat, chemicals, fuel, brake fluid, or solvents.'])}${exclusionGroup('Improper Care',['Incompatible cleaners, abrasive tools, close-range pressure washing, automatic brushes, improper polishing, adhesive removal, coatings, steam, or heat guns.'])}${exclusionGroup('Normal Wear and Aging',['Minor scratches, rock marks, wear, reduced gloss, hydrophobicity or self-healing, edge dirt, and color change below the abnormal-yellowing standard.'])}${exclusionGroup('Vehicle Paint Conditions',['Non-original or repaired paint, poor adhesion, uncured paint, paint lifting during removal, and pre-existing paint defects.'])}${exclusionGroup('Unauthorized Work',['Unauthorized removal, patching, replacement, cutting, spraying, sanding, polishing, chemical treatment, third-party repair damage, or unverifiable records.'])}</div>`, true),
    policySection(cardId, 5, 'resolution', 'Warranty Resolution', numberedList(['The installing store or brand service team will inspect the claim.','Additional photos, video, records, receipts, or repair history may be required.','Confirmed material or manufacturing defects may be repaired or replaced.','Treatment is normally limited to the affected film piece or body panel, not the entire vehicle.','A confirmed batch or roll issue may justify broader inspection.','Approved service may include replacement material, removal, adhesive cleanup, and reasonable reinstallation.','Transportation, travel, downtime, substitute vehicles, component removal, and incidental costs are excluded unless expressly stated.','An unavailable product may be replaced with one of equal or better performance and warranty level.','Replacement details must be recorded; the remaining term follows applicable law, policy, and the electronic record.'])),
    policySection(cardId, 6, 'application', 'Required Claim Information', claimInformation(['Electronic warranty number.','Registered phone number.','Vehicle VIN.','Receipt, installation order, or payment record.','Full-vehicle and affected-area photos.','Clear close-up photos and video showing the issue.','Date first noticed and issue description.','Accident, repair, repaint, or touch-up history.','Any removal, repair, patching, or reinstallation by another shop.']))
  ].join('');
}

function windowFilmPolicy(cardId) {
  return [
    policySection(cardId, 1, 'coverage', 'Warranty Coverage', `<p>When professionally installed and normally used and maintained, confirmed material or manufacturing defects may be handled under this policy.</p><div class="policy-items">${policyItem('Abnormal Cracking or Crazing','Non-normal cracking without impact, cutting, scratching, glass breakage, or chemical corrosion.')}${policyItem('Material-Related Bubbling','Bubbling caused by the film, adhesive, or composite structure. Temporary curing haze, water patterns, or water pockets are not automatically defects.')}${policyItem('Adhesive Failure, Peeling, or Delamination','Abnormal large-area adhesive failure, lifting, peeling, or internal separation.')}${policyItem('Abnormal Fading, Color Change, or Purpling','A color change clearly beyond normal aging.')}${policyItem('Metal-Layer Failure','For metallized products only: abnormal demetallization, mottling, or visibly uneven change.')}</div><p>Covered conditions depend on the registered series and policy.</p>`),
    policySection(cardId, 2, 'installation-quality', 'Installation Workmanship Issues', numberedList(['Visible dust, hair, or debris under the film.','Residual water or insufficient water removal.','Uneven cutting, abnormal edge gaps, or localized edge lifting.','Scratches, folds, pressure marks, or adhesive marks caused by installation tools.','Damage to glass, defroster lines, antennas, seals, trim, or electronics caused during installation.','Short-term edge adhesive failure or unsecured finishing.','Product, VLT, shade, or installed windows that differ from the order.'])),
    policySection(cardId, 3, 'exclusions', 'What Is Not Covered', `<div class="exclusion-grid">${exclusionGroup('Glass and Vehicle Conditions',['Pre-existing glass defects; glass breakage from accident, impact, temperature change, or body movement; equipment faults; seal or regulator abrasion; damage during glass replacement or repair.'])}${exclusionGroup('External or Human Damage',['Sharp objects, impacts, vandalism, window-channel debris, pets, children, or cargo.'])}${exclusionGroup('Improper Care',['Strong chemicals, blades, abrasive tools, pressure water, steam, premature washing or window operation, and failure to follow care instructions.'])}${exclusionGroup('Unauthorized Work',['Unauthorized removal, repair, cutting, reinstallation, chemical treatment, grinding, or unverifiable product and installation records.'])}${exclusionGroup('Normal Changes',['Minor color change, scratches, wear, edge dirt, permitted VLT or appearance variation, and visual differences caused by glass, angle, or lighting.'])}</div>`, true),
    policySection(cardId, 4, 'resolution', 'Warranty Resolution', numberedList(['The installing store or brand service team inspects each claim.','Confirmed defects are normally resolved by replacing film on the affected window only.','One affected window does not automatically qualify all windows for replacement.','Approved work may include material, necessary removal, and reinstallation labor.','Glass, glass replacement, vehicle repair, and vehicle component costs are not included by default.','Unavailable products may be replaced with an equal-or-better product.','Replacement coverage follows the applicable policy and electronic record.','A concentrated batch issue may justify wider inspection.'])),
    policySection(cardId, 5, 'application', 'Required Claim Information', claimInformation(['Electronic warranty number and vehicle VIN.','Exact affected window.','Full-vehicle, wide-angle window, and clear close-up photos.','Video showing bubbling, adhesive failure, cracking, or color change.','Receipt or installation order.','Date first noticed.','Any accident, glass replacement, or vehicle repair history.'])),
    policySection(cardId, 6, 'notice', 'Important Notice', numberedList(['This warranty is not vehicle-glass insurance.','It does not automatically cover broken glass, glass replacement, or vehicle repair.','Heat rejection, infrared rejection, UV rejection, and VLT depend on product data and test conditions.','Tint and VLT laws vary by location; the installation and use must comply with applicable law.','Coverage is determined from the product, glass, installation records, use, and inspection.','This warranty does not limit rights provided by applicable law.']))
  ].join('');
}

function pvcPolicy(cardId) {
  return [
    policySection(cardId, 1, 'coverage', 'Warranty Coverage', `<p>PVC color-change film changes vehicle color and appearance. It is not paint protection film and does not provide basic coverage for rock impacts, scrapes, scratches, or collisions.</p><div class="policy-items">${policyItem('Abnormal Yellowing or Color Change','Yellowing, fading, or color change clearly beyond normal aging and the applicable standard.')}${policyItem('Material-Related Bubbling','Bubbling caused by the film, adhesive, or composite structure.')}${policyItem('Film Cracking or Crazing','Abnormal cracking without collision, impact, cutting, scratching, or chemical corrosion.')}${policyItem('Material Delamination','Abnormal separation of the surface, color, substrate, or adhesive layers.')}${policyItem('Abnormal Adhesive Failure','Large-area loss of adhesion or premature peeling after workmanship, paint, and external causes are excluded.')}</div>`),
    policySection(cardId, 2, 'surface-terms', 'Vertical and Horizontal Surface Terms', `<p>Warranty terms may differ by exposure. Vertical surfaces commonly include doors, the main vertical areas of fenders and bumpers, and side body panels.</p><p>Horizontal or high-exposure surfaces commonly include the hood, roof, upper trunk lid, upper spoiler, upper mirrors, and other surfaces receiving strong direct sunlight. The registered product policy and electronic certificate control.</p>`),
    policySection(cardId, 3, 'installation-quality', 'Installation Workmanship Issues', numberedList(['Lifted edges or failed wrapped edges.','Retraction in deep channels, handles, bumpers, or complex curves caused by overstretching.','Seams, joins, or wrapped edges that differ from the agreement.','Whitening, discoloration, texture distortion, or gloss loss caused by overstretching.','Visible dust, hair, or debris.','Paint cuts caused by installation tools.','Damage, noise, or improper reassembly caused by component removal.','Product color, model, or coverage differing from the order.'])),
    policySection(cardId, 4, 'exclusions', 'What Is Not Covered', `<div class="exclusion-grid">${exclusionGroup('Accidents and External Damage',['Collisions, scrapes, road debris, sharp objects, vandalism, and other external damage.'])}${exclusionGroup('Normal Change',['Normal fading, reduced gloss, texture changes, sunlight aging on high-exposure surfaces, washing marks, edge dirt, and viewing-angle color differences.'])}${exclusionGroup('Contamination and Chemicals',['Bird droppings, insects, sap, tar, paint, cement, industrial fallout, fuels, brake fluid, oils, acids, alkalis, solvents, improper adhesive removal, polishing, coatings, and close-range pressure washing.'])}${exclusionGroup('Vehicle Paint',['Non-original or repaired paint, poor adhesion, cracking, bubbling, oxidation, paint lifting during removal, and pre-existing defects.'])}${exclusionGroup('Color Matching',['Reasonable batch, age, sunlight, and local-replacement color or gloss differences, including discontinued colors.'])}${exclusionGroup('Unauthorized Work',['Unauthorized removal, patching, replacement, spraying, sanding, polishing, chemical treatment, or unverifiable product records.'])}</div>`, true),
    policySection(cardId, 5, 'resolution', 'Warranty Resolution', numberedList(['Confirmed defects are normally resolved on the affected body panel only.','One affected panel does not automatically qualify the full vehicle for replacement.','Approved work may include replacement material, removal, and reinstallation.','Reasonable color differences after local replacement do not automatically justify full-vehicle replacement.','Discontinued colors may be replaced with an equivalent product under an agreed plan.','Paint failure or paint damage is not covered by default.','Replacement product, color, roll, batch, panel, and date must be recorded.'])),
    policySection(cardId, 6, 'application', 'Important Notice', numberedList(['PVC color-change film is not paint protection film.','Rock-impact protection, scrape protection, and self-healing are not default PVC warranty items.','Vertical and horizontal surfaces may have different terms.','Reasonable color differences may follow local replacement.','Coverage requires review of product batch, installation, paint, environment, and inspection.','This warranty does not limit rights provided by applicable law.']))
  ].join('');
}

function architecturalPolicy(cardId, item) {
  const glass = item.glassBreakageCoverage === 'Included';
  const seal = item.sealFailureCoverage === 'Included';
  return [
    policySection(cardId, 1, 'coverage', 'Film Warranty Coverage', `<p>For approved compatible flat glass, professional installation, normal building use, and reasonable maintenance, confirmed material or manufacturing defects may be handled under this policy.</p><div class="policy-items">${policyItem('Abnormal Bubbling','Bubbling caused by the film, adhesive, or composite structure.')}${policyItem('Peeling, Lifting, or Adhesive Failure','Abnormal large-area separation or adhesive failure.')}${policyItem('Film Cracking','Abnormal cracking without impact, scratching, building movement, or chemical corrosion.')}${policyItem('Delamination','Abnormal separation of coating, functional layer, substrate, or adhesive.')}${policyItem('Abnormal Rippling or Wrinkling','Visible distortion after glass, workmanship, and structural causes are excluded.')}${policyItem('Metal-Layer Failure','For metallized products only: abnormal demetallization, mottling, or uneven reflectivity.')}${policyItem('Abnormal Color Change or Fading','Change clearly beyond normal aging.')}${policyItem('Optical Failure','Severe haze, clarity, or reflective-appearance failure when expressly covered by the product policy.')}</div>`),
    policySection(cardId, 2, 'glass-coverage', 'Optional Glass Coverage', `<p><strong>Thermal Glass Breakage Coverage:</strong> ${glass ? 'Included' : 'Not included'}.</p><p><strong>Insulated-Glass Seal Failure Coverage:</strong> ${seal ? 'Included' : 'Not included'}.</p><p>${glass ? 'Included thermal-breakage coverage applies only to approved compatible glass, documented pre-installation inspection, completed registration, and a confirmed film-caused thermal-stress break, subject to stated limits.' : 'Glass breakage is not covered by this electronic certificate.'}</p><p>${seal ? 'Included seal-failure coverage applies only when film directly caused the failure and every product, original-glass warranty, registration, limit, and approval condition is met.' : 'Insulated-glass seal failure is not covered by this electronic certificate.'}</p>`),
    policySection(cardId, 3, 'conditions', 'Warranty Eligibility Requirements', numberedList(['Approved architectural flat glass and compatible product.','Glass type, thickness, construction, and pre-existing defects were recorded before installation.','Installation side, method, and edge treatment meet specifications.','Required edge sealing or structural attachment was completed.','The complete glass unit was covered; no unauthorized partial or multilayer application.','Warranty registration is linked to the correct address and installation location.','No unauthorized removal or reinstallation.','Required pre-approval exists for special glass or large projects.'])),
    policySection(cardId, 4, 'installation-quality', 'Installation Workmanship Issues', numberedList(['Residual water or water pockets.','Dust, hair, or debris under the film.','Squeegee marks, folds, pressure marks, adhesive marks, or scratches.','Unacceptable gaps, cutting, or seams.','Damage to glass, frames, sealant, trim, or interiors.','Incorrect direction, product, or installation side.','Missing required edge sealing or structural attachment.'])),
    policySection(cardId, 5, 'exclusions', 'What Is Not Covered', `<div class="exclusion-grid">${exclusionGroup('Existing Glass or Building Conditions',['Pre-existing defects; defective frames, sealants, blocks, or structures; undisclosed prior breakage or seal failure; settlement, deformation, or improper glass installation.'])}${exclusionGroup('Unapproved Application',['Incompatible glass, multilayer or partial installation, unapproved curved or coated glass, incompatible plastics, incorrect interior/exterior use, or missing edge sealing.'])}${exclusionGroup('External and Environmental Damage',['Impact, vandalism, construction work, fire, flood, storm, earthquake, building movement, uneven shading, nearby heat, abrasion, acid rain, contaminants, or chemicals.'])}${exclusionGroup('Improper Care',['Strong chemicals, abrasives, blades, pressure washing, mechanical cleaning, premature cleaning, or failure to follow care instructions.'])}${exclusionGroup('Unauthorized Work',['Unauthorized removal, replacement, cutting, repair, added paint or graphics, or unverifiable product and location records.'])}${exclusionGroup('Other Costs',['Scaffolding, lifts, access equipment, moving furnishings, restoration work, business interruption, lodging, and indirect losses unless expressly included.'])}</div>`, true),
    policySection(cardId, 6, 'resolution', 'Warranty Resolution', numberedList(['Confirmed film defects are normally handled on the affected glass unit only.','One affected unit does not automatically qualify the entire project for replacement.','Approved service may include material, removal, and reinstallation labor.','Glass breakage and seal failure are handled only when specifically included.','Optional coverage follows the certificate term, limits, glass type, and approvals.','Unavailable products may be replaced with an equal-or-better product.','A concentrated project or batch issue may justify wider inspection.','Treatment records must identify glass location, area, new product and batch, date, and installer.'])),
    policySection(cardId, 7, 'application', 'Required Claim Information', claimInformation(['Electronic warranty number.','Project name and address.','Building, floor, room, and glass location.','Full-glass and clear close-up photos.','Video showing bubbling, peeling, cracking, color change, or glass failure.','Receipt, installation contract, or acceptance record.','Glass type, thickness, and construction.','Pre-installation glass inspection record.','Date first noticed.','For glass or seal claims: before-and-after photos, replacement estimate, and other requested documents.'])),
    policySection(cardId, 8, 'notice', 'Important Notice', numberedList(['Film warranty, thermal-breakage coverage, and seal-failure coverage are separate benefits.','Optional glass coverage not shown as Included is not provided.','Safety film may help retain broken glass but does not prevent breakage or guarantee ballistic, theft, personal, or property protection.','Energy, heat, shade, privacy, and safety results vary by glass, orientation, environment, installation, and use.','Residential, commercial, interior, exterior, decorative, safety, and anti-graffiti products may have different terms.','Coverage requires review of the product, glass, project, records, environment, and inspection.','This warranty does not limit rights provided by applicable law.']))
  ].join('');
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

  const category = warrantyCategory(item);
  const colorPpf = category === 'vehicleColorChange' && item.colorChangeSubtype === 'colorPpf';
  const title = category === 'automotiveWindowFilm' ? 'QUAD FILM Automotive Window Film Limited Warranty' : category === 'architecturalGlassFilm' ? 'QUAD FILM Architectural Glass Film Limited Warranty' : colorPpf ? 'QUAD FILM Color Paint Protection Film Limited Warranty' : category === 'vehicleColorChange' ? 'QUAD FILM Vehicle Color Change Film Limited Warranty' : 'QUAD FILM Paint Protection Film Limited Warranty';
  const summary = category === 'architecturalGlassFilm'
    ? [summaryField('Project Name', item.projectName), summaryField('Project Address', item.projectAddress), summaryField('Property Type', item.propertyType), summaryField('Warranty Product', product), summaryField('Product Series', item.productSeries), summaryField('Application', item.applicationType), summaryField('Installation Side', item.installationSide), summaryField('Installation Area', item.installationArea || item.areas), summaryField('Film Warranty Term', item.filmWarrantyTerm || warrantyYears(item.installDate, item.warrantyUntil)), summaryField('Thermal Glass Breakage Coverage', item.glassBreakageCoverage || 'Not included'), summaryField('Insulated-Glass Seal Failure Coverage', item.sealFailureCoverage || 'Not included'), summaryField('Warranty Number', warrantyNumber(item.id)), summaryField('Installing Contractor', item.installerName || 'QUAD FILM'), summaryField('Warranty Status', status)].join('')
    : [summaryField('Warranty Product', product), summaryField('Product Series', item.productSeries), summaryField('Warranty Term', warrantyYears(item.installDate, item.warrantyUntil)), summaryField('Warranty Dates', `${startDate} to ${endDate}`), summaryField('Warranty Number', warrantyNumber(item.id)), summaryField('Vehicle VIN', item.vehicleVin), summaryField('Installing Store', item.installerName || 'QUAD FILM'), summaryField('Warranty Status', status), summaryField('Covered Vehicle', `${vehicle} · ${plate}`), category === 'automotiveWindowFilm' ? summaryField('Installed Windows', item.installedWindows || item.areas) : summaryField('Installed Panels', item.installedPanels || item.areas), category === 'automotiveWindowFilm' ? summaryField('VLT / Shade', item.filmVlt) : '', category === 'automotiveWindowFilm' ? summaryField('Transfer Policy', item.transferPolicy) : '', category === 'vehicleColorChange' ? summaryField('Color / Code', item.colorCode) : '', category === 'vehicleColorChange' && !colorPpf ? summaryField('Vertical Surface Term', item.verticalWarrantyTerm) : '', category === 'vehicleColorChange' && !colorPpf ? summaryField('Horizontal / High-Exposure Term', item.horizontalWarrantyTerm) : ''].join('');
  const notice = category === 'automotiveWindowFilm' ? 'This is a limited warranty for automotive window film material and manufacturing defects. It is not glass insurance and does not cover accidents, broken glass, unlawful use, or external damage.' : category === 'architecturalGlassFilm' ? 'This is a limited warranty for architectural glass film material and manufacturing defects. Thermal glass breakage and insulated-glass seal failure are separate optional benefits and apply only when shown as Included.' : category === 'vehicleColorChange' && !colorPpf ? 'This is a limited warranty for PVC vehicle color-change film material and manufacturing defects. PVC color-change film changes appearance and is not paint protection film.' : 'This is a limited warranty for product material and manufacturing defects. It is not insurance for accidents, scratches, rock impacts, or external damage.';
  const policy = category === 'automotiveWindowFilm' ? windowFilmPolicy(cardId) : category === 'architecturalGlassFilm' ? architecturalPolicy(cardId, item) : category === 'vehicleColorChange' && !colorPpf ? pvcPolicy(cardId) : ppfPolicy(cardId, colorPpf);
  const coveredLabel = category === 'architecturalGlassFilm' ? 'View Covered Project' : 'View Covered Vehicle';

  return `<article class="warranty-detail" id="${cardId}">
    <section class="warranty-summary" id="${cardId}-vehicle">
      <div class="summary-title-row">
        <div><span class="summary-eyebrow">QUAD FILM LIMITED WARRANTY</span><h2>${escapeHtml(title)}</h2></div>
        <span class="status-badge ${expired ? 'expired' : ''}">${escapeHtml(status)}</span>
      </div>
      <div class="summary-grid">${summary}</div>
      <div class="limited-warranty-notice">${escapeHtml(notice)}</div>
      <div class="registered-detail"><div><span>Registered Installation Areas</span><p>${escapeHtml(customerFacingText(item.areas, 'Not registered'))}</p></div><div><span>Electronic Warranty Notes</span><p>${escapeHtml(customerFacingText(item.warrantyContent, 'Subject to the warranty policy shown on this page'))}</p></div></div>
      ${photos.length ? `<div class="warranty-photos" id="${cardId}-installation"><h3>Covered Vehicle and Installation Photos</h3><div>${photos.map(photo => `<a href="${escapeHtml(photo.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(customerFacingText(photo.name, 'Vehicle installation photo'))}" loading="lazy" /></a>`).join('')}</div></div>` : `<div id="${cardId}-installation" class="no-photo-note">No installation photos have been uploaded for this warranty record.</div>`}
      <div class="detail-actions">
        <button type="button" class="primary-action" onclick="scrollWarrantySection('${cardId}','application')">Apply for Warranty Service</button>
        <button type="button" class="secondary-action" onclick="scrollWarrantySection('${cardId}','vehicle')">${coveredLabel}</button>
        <button type="button" class="secondary-action" onclick="scrollWarrantySection('${cardId}','installation')">View Installation Information</button>
      </div>
    </section>

    <div class="policy-grid">${policy}</div>

    <section class="important-notice"><h3>Customer Acknowledgment</h3><p>The category-specific policy above forms part of this electronic warranty record.</p>
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
