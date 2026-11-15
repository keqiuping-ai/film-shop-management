const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const products = [
  {
    slug:'paint-protection-film', name:'Paint Protection Film (PPF)', short:'Paint Protection Film', category:'Automotive Paint Protection Film', image:'/assets/quad-f1-installation-process.jpg',
    title:'Paint Protection Film (PPF) Supplier | QUAD FILM USA',
    description:'Explore QUAD FILM paint protection film for professional automotive and marine applications, including gloss, matte, satin, and targeted protection options.',
    lead:'Professional clear and specialty-finish protection films for installers, dealers, automotive projects, and selected marine surfaces.',
    overview:'QUAD FILM paint protection film is designed for professional installation on vehicle paint and other compatible high-gloss surfaces. Product selection depends on the desired finish, coverage area, installation method, and project environment.',
    features:[['FINISH OPTIONS','Gloss, Matte & Satin','Choose a finish that preserves gloss or intentionally changes the surface appearance.'],['APPLICATION','Full or Targeted Coverage','Plan complete coverage or focus on high-impact areas such as bumpers, hoods, mirrors, and edges.'],['PROFESSIONAL USE','Installer-Focused Selection','Match film model, roll size, finish, and application requirements before ordering.']],
    faqs:[['What is paint protection film used for?','PPF is applied to compatible painted surfaces to help protect against everyday road wear, light scratches, and surface contamination.'],['Can I choose different finishes?','Available selections may include gloss, matte, satin, or specialty effects. Confirm the current catalog and inventory before ordering.'],['Does PPF require professional installation?','Professional installation is recommended because surface preparation, stretching, edge work, and contamination control affect the finished result.']]
  },
  {
    slug:'color-wrap-film', name:'Automotive Color Wrap Film', short:'Color Wrap Film', category:'Automotive Color Change Wrap', image:'/assets/quad-sema-showcase-poster.jpg',
    title:'Automotive Color Wrap Film Supplier | QUAD FILM USA',
    description:'Browse QUAD FILM automotive color wrap solutions for professional vehicle restyling, with colors, finishes, textures, and coded selections.',
    lead:'Color, finish, and texture options for professional automotive restyling and dealer ordering.',
    overview:'Color wrap film changes a vehicle appearance without repainting the original surface. QUAD FILM supports professional selection by color code, finish, material type, roll specification, and available inventory.',
    features:[['COLOR SYSTEM','Coded Color Selection','Use product codes and real vehicle previews to compare available color directions.'],['MATERIAL CHOICE','Vinyl & TPU Options','Understand the intended use, care, surface behavior, and removal considerations before choosing a material.'],['PROJECT PLANNING','Vehicle-Based Ordering','Confirm vehicle size, coverage plan, roll specification, and quantity before checkout.']],
    faqs:[['What is automotive color wrap film?','It is a removable film applied over compatible vehicle surfaces to change color or finish without conventional repainting.'],['How should I choose a color?','Compare the physical sample, finish, product code, and real-world lighting. Screen colors are useful for browsing but are not a final color guarantee.'],['How much film does a vehicle need?','Required material depends on vehicle dimensions, coverage, panel complexity, installer technique, and allowance for rework.']]
  },
  {
    slug:'automotive-window-film', name:'Automotive Window Film', short:'Automotive Window Film', category:'Automotive Window Tint Film', image:'/retail/assets/tint/roadside-daylight.jpg?v=2',
    title:'Automotive Window Film Supplier | QUAD FILM USA',
    description:'Compare QUAD FILM automotive window film series by visible light transmission, heat-control structure, application position, and dealer availability.',
    lead:'Professional automotive window film options organized by technology, visible light transmission, and installation position.',
    overview:'Automotive window film selection should consider local regulations, desired visible light transmission, heat-control goals, glass position, optical clarity, and installation requirements. QUAD FILM provides multiple series for professional comparison and ordering.',
    features:[['PERFORMANCE','Series-Based Comparison','Compare product families by construction, visible light transmission, and intended performance level.'],['VISIBILITY','Multiple VLT Options','Select a visible light transmission level appropriate for the glass position, customer preference, and applicable law.'],['INSTALLATION','Professional Film Handling','Confirm model, roll size, shrink behavior, and installation technique before ordering.']],
    faqs:[['What does VLT mean?','Visible light transmission is the percentage of visible light that passes through the film and glass system.'],['Which window film is best for a vehicle?','The right choice depends on local law, glass position, desired appearance, heat-control goals, and installer recommendations.'],['Can window film be ordered online?','Available dealer inventory and contract pricing are shown after an approved dealer signs in.']]
  },
  {
    slug:'tesla-panoramic-roof-film', name:'Tesla Panoramic Roof Exterior Film', short:'Tesla Roof Film', category:'Tesla Panoramic Roof Film', image:'/assets/window-tint-vehicle-top-mobile.jpg',
    title:'Tesla Panoramic Roof Exterior Heat-Rejection Film | QUAD FILM',
    description:'Discover QUAD FILM exterior-applied heat-rejection film for large Tesla panoramic glass roofs, designed for professional stretch installation.',
    lead:'A purpose-built exterior-applied film for large panoramic glass roofs and professional installation workflows.',
    overview:'The QUAD FILM Tesla panoramic roof product is applied to the exterior glass so solar energy can be addressed before entering the cabin. Its conformable construction is designed to support installation across large curved roof glass.',
    features:[['EXTERIOR APPLICATION','Solar Control at the Outer Glass','The film is installed on the exterior surface of compatible panoramic roof glass.'],['INSTALLATION','Conformable Construction','The material is designed to stretch into place without conventional heat forming.'],['VEHICLE FIT','Panoramic Roof Focus','Confirm vehicle model, roof dimensions, glass condition, and installation procedure before use.']],
    faqs:[['Is this film installed inside or outside?','This featured product is designed for exterior application on compatible panoramic roof glass.'],['Does installation require heat forming?','The featured construction is designed for stretch installation without conventional heat forming; installers should still follow the current product procedure.'],['Is it only for Tesla vehicles?','The product is presented for Tesla panoramic roof applications. Confirm compatibility before using it on any other vehicle or glass system.']]
  },
  {
    slug:'architectural-window-film', name:'Architectural Window Film', short:'Architectural Window Film', category:'Residential and Commercial Window Film', image:'/assets/architectural-heat-commercial.jpg',
    title:'Architectural Window Film Solutions | QUAD FILM USA',
    description:'Explore QUAD FILM architectural window film for heat control, privacy, decorative finishes, and safety or security applications.',
    lead:'Film solutions for residential and commercial glass, including heat control, privacy, decorative, and safety applications.',
    overview:'Architectural window film can improve the function and appearance of existing glass without complete glass replacement. Product selection should reflect the glass type, building conditions, performance objective, and professional compatibility review.',
    features:[['SOLAR CONTROL','Comfort & Heat Management','Select films intended to reduce incoming solar heat while maintaining the desired daylight and appearance.'],['PRIVACY','Reflective or Frosted Options','Create daytime privacy, decorative screening, or visual separation for interior spaces.'],['SAFETY','Glass-Retention Applications','Specialty films can help hold broken glass together; suitability depends on the complete glazing system and installation specification.']],
    faqs:[['Can architectural film be installed on any glass?','Compatibility depends on glass type, coating, thickness, condition, exposure, and the selected film. A professional glass review is recommended.'],['Does privacy film work at night?','Reflective daytime privacy depends on lighting conditions. Frosted or opaque decorative films provide a different privacy effect.'],['Is safety film the same as impact-resistant glass?','No. Film is one component of a glazing system and should not be represented as a replacement for rated impact-resistant glass unless the complete tested system supports that claim.']]
  },
  {
    slug:'interior-surface-film', name:'Interior Surface Film', short:'Interior Surface Film', category:'Decorative Interior Surface Film', image:'/assets/interior-film-countertop.jpg',
    title:'Interior Surface Film for Renovation | QUAD FILM USA',
    description:'Explore QUAD FILM decorative interior surface film for countertops, cabinetry, furniture, walls, and selected renovation applications.',
    lead:'Decorative and protective finishes for countertops, cabinetry, furniture, walls, and commercial interiors.',
    overview:'Interior surface film refreshes compatible existing surfaces with less demolition than full material replacement. Finish selection and installation planning should reflect substrate condition, edge details, heat exposure, moisture, and cleaning requirements.',
    features:[['APPLICATIONS','Counters, Cabinets & Furniture','Use compatible finishes on selected interior fixtures, millwork, furniture, and feature surfaces.'],['FINISHES','Stone, Wood & Solid Looks','Compare visual direction, texture, edge treatment, and surrounding materials before selection.'],['RENOVATION','Lower-Disruption Workflow','Surface refinishing can reduce removal and replacement work when the existing substrate is suitable.']],
    faqs:[['What surfaces can be wrapped?','Suitability depends on substrate stability, smoothness, cleanliness, shape, edge condition, moisture, and expected use.'],['Can surface film replace damaged material?','Film changes the finish but does not repair an unstable or severely damaged substrate. Repairs may be required first.'],['Is professional installation recommended?','Yes. Corners, seams, edges, heat exposure, and surface preparation have a major effect on durability and appearance.']]
  },
  {
    slug:'yacht-protection-film', name:'Yacht Protection Film', short:'Yacht Protection Film', category:'Marine Paint Protection Film', image:'/assets/yacht-protection-film-ppf.jpg',
    title:'Yacht and Marine Protection Film | QUAD FILM USA',
    description:'Explore QUAD FILM yacht and marine protection film for compatible gelcoat, painted surfaces, high-contact areas, and selected interiors.',
    lead:'Marine-focused protection films for compatible gelcoat, painted surfaces, high-contact areas, and selected yacht interiors.',
    overview:'Marine protection film selection must account for substrate type, finish, exposure, edge placement, maintenance, and the operating environment. Professional compatibility review is important before applying film to a yacht or marine surface.',
    features:[['MARINE USE','Selected Exterior Surfaces','Plan protection for compatible painted or gelcoat areas exposed to contact and routine wear.'],['DETAILING','High-Contact Zones','Consider rails, boarding areas, edges, interior fixtures, and other frequently handled surfaces.'],['PLANNING','Surface-Specific Review','Confirm adhesion, finish compatibility, edge strategy, maintenance, and removal expectations before installation.']],
    faqs:[['Can automotive PPF be used on a yacht?','Some film constructions may suit selected marine surfaces, but compatibility and exposure conditions must be reviewed for each project.'],['Does film work on gelcoat?','It may be suitable for compatible, stable, properly prepared gelcoat. Test and confirm the specific surface before full installation.'],['What areas are commonly considered?','Projects may focus on high-contact zones, selected painted panels, gloss surfaces, boarding areas, or compatible interior finishes.']]
  }
];

const links = products.map(item=>`<a href="/products/${item.slug}/">${item.short}</a>`).join('');

function page(product) {
  const canonical=`https://quadfilmus.com/products/${product.slug}/`;
  const featureHtml=product.features.map((item,index)=>`<article><span>0${index+1}</span><h3>${item[0]}</h3><b>${item[1]}</b><p>${item[2]}</p></article>`).join('');
  const faqHtml=product.faqs.map(item=>`<details><summary>${item[0]}</summary><p>${item[1]}</p></details>`).join('');
  const schema=JSON.stringify({'@context':'https://schema.org','@graph':[{'@type':'Product','@id':`${canonical}#product`,name:product.name,description:product.description,image:`https://quadfilmus.com${product.image.split('?')[0]}`,category:product.category,brand:{'@type':'Brand',name:'QUAD FILM'},url:canonical},{'@type':'BreadcrumbList','@id':`${canonical}#breadcrumb`,itemListElement:[{'@type':'ListItem',position:1,name:'QUAD FILM',item:'https://quadfilmus.com/'},{'@type':'ListItem',position:2,name:product.name,item:canonical}]},{'@type':'FAQPage','@id':`${canonical}#faq`,mainEntity:product.faqs.map(([name,text])=>({'@type':'Question',name,acceptedAnswer:{'@type':'Answer',text}}))}]});
  return `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${product.title}</title><meta name="description" content="${product.description}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1"><link rel="canonical" href="${canonical}"><meta property="og:type" content="product"><meta property="og:site_name" content="QUAD FILM"><meta property="og:title" content="${product.title}"><meta property="og:description" content="${product.description}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="https://quadfilmus.com${product.image.split('?')[0]}"><script type="application/ld+json">${schema}</script><link rel="icon" href="/quad-film-icon.png"><link rel="stylesheet" href="/product-page.css?v=1"></head><body><header><a class="brand" href="/"><img src="/quad-film-icon.png" alt="QUAD FILM"><span><b>QUAD FILM</b><small>ADVANCED FILM TECHNOLOGY</small></span></a><a class="back" href="/#collections">ALL PRODUCTS</a></header><main><section class="hero"><div class="hero-copy"><span class="eyebrow">QUAD FILM · PROFESSIONAL FILM SOLUTIONS</span><h1>${product.name}</h1><p>${product.lead}</p><div class="hero-actions"><a href="/#collections">EXPLORE THE CATALOG</a><a class="secondary" href="/#collections">DEALER ORDERING</a></div></div><div class="hero-media"><img src="${product.image}" alt="${product.name} by QUAD FILM" fetchpriority="high"></div></section><section class="content"><div class="intro"><h2>Built for informed product selection.</h2><div><p>${product.overview}</p></div></div><div class="features">${featureHtml}</div></section><section class="faq"><div class="faq-inner"><h2>${product.short} questions</h2><div class="faq-list">${faqHtml}</div></div></section><section class="related"><h2>Explore more QUAD FILM solutions</h2><div class="related-links">${links}</div></section></main><section class="locations"><article><b>Santa Monica, California</b><address>3212 Santa Monica Blvd, Santa Monica, CA 90404</address></article><article><b>Las Vegas, Nevada</b><address>3359 W Oquendo Rd, Las Vegas, NV 89118</address></article></section><footer><b>QUAD FILM</b>Professional automotive, architectural, interior, and marine film solutions.</footer></body></html>`;
}

for (const product of products) {
  const directory=path.join(root,'public','products',product.slug);
  fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'index.html'),page(product));
}

console.log(`Generated ${products.length} SEO product pages.`);
