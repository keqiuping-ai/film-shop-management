#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function navigationUrl(origin, destination) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

function mapUrl(name, address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${address}`)}`;
}

function markArchitectural(record, services, evidence, sourceUrls = []) {
  record.architecturalServices = services;
  record.interestedProducts = ['建筑玻璃膜'];
  record.currentProducts = services;
  record.customerType = '建筑膜客户';
  const currentServices = String(record.services || '').trim();
  const architecturalLine = `建筑膜业务 / Architectural film: ${services}`;
  record.services = currentServices.includes(architecturalLine)
    ? currentServices
    : currentServices && currentServices !== services
      ? `${currentServices}\n${architecturalLine}`
      : services;
  record.serviceEvidence = evidence;
  record.serviceSources = [...new Set([...(record.serviceSources || []), ...sourceUrls])];
  return record;
}

function applyExisting(records, recordId, services, evidence, sourceUrls) {
  const record = records.find(item => item.publicRecordId === recordId);
  if (!record) throw new Error(`Missing existing record ${recordId}`);
  markArchitectural(record, services, evidence, sourceUrls);
}

function addUnique(records, record) {
  const existingIndex = records.findIndex(item => item.publicRecordId === record.publicRecordId);
  if (existingIndex >= 0) records[existingIndex] = { ...records[existingIndex], ...record };
  else records.push(record);
}

function updateSantaMonica() {
  const file = path.join(root, 'migrations', 'santa-monica-field-sales-2026-10-13.json');
  const seed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const origin = '3212 Santa Monica Blvd, Santa Monica, CA 90404';

  applyExisting(
    seed.records,
    'SM173',
    'Residential glass film / 住宅玻璃膜; Commercial glass film / 商业建筑玻璃膜',
    'Official website and public business listing identify commercial and residential window film services / 官网及公开商家资料明确列出商业与住宅窗膜服务',
    ['http://tintpluswindowtinting.com/']
  );
  applyExisting(
    seed.records,
    'SM176',
    'Architectural film / 建筑膜; Commercial glass film / 商业建筑玻璃膜',
    'Public business listing identifies automotive and architectural film services; confirm exact product lines before visiting / 公开商家资料明确列出汽车膜与建筑膜，出访前确认具体产品线',
    ['https://www.thefrenchwrapper.com/']
  );

  const additions = [
    {
      publicRecordId:'ARCH-LA001', businessName:'American Window Film Los Angeles', city:'Carson',
      address:'118 Savarona Way, Carson, CA 90746', distanceKm:31.8, distanceBand:'0–50 km / 公里',
      services:'Residential glass film / 住宅玻璃膜; Commercial glass film / 商业建筑玻璃膜; Solar and heat-control film / 隔热防晒膜; Safety and security film / 安全防爆膜; Anti-graffiti film / 防涂鸦膜; Decorative and privacy film / 装饰及隐私膜',
      filmBrands:'3M', phone:'+1 818-888-1600', website:'https://americanwindowfilm.com/locations/los-angeles-window-film',
      directorySource:'https://findawrap.com/shops/carson-ca/american-window-film-commercial-home-window-tinting-los-angeles-carson-ca',
      serviceSources:['https://americanwindowfilm.com/locations/los-angeles-window-film'], lat:33.867193, lng:-118.274606,
      researchNotes:'Official location page confirms residential and commercial architectural window film services / 官方分店页面确认住宅及商业建筑窗膜服务',
      route:'B', visitRegion:'南湾／长滩', visitBatch:'ARCH-LA-B-01', visitStop:1,
      referencePhotos:[{url:'https://americanwindowfilm.com/hubfs/los-angeles-window-fim/los-angeles-window-film.jpg',fileName:'ARCH-LA001-official.jpg',contentType:'image/jpeg',sourceLabel:'Official website reference image; not a field check-in photo',sourceUrl:'https://americanwindowfilm.com/locations/los-angeles-window-film'}]
    },
    {
      publicRecordId:'ARCH-LA002', businessName:'Window Film Depot Los Angeles', city:'Los Angeles',
      address:'4445 S Figueroa St 31st Flr, Los Angeles, CA 90037', distanceKm:20.7, distanceBand:'0–50 km / 公里',
      services:'Residential glass film / 住宅玻璃膜; Commercial glass film / 商业建筑玻璃膜; Solar and energy-saving film / 隔热节能膜; Safety and security film / 安全防爆膜; Decorative film / 装饰膜; Commercial graphics / 商业图文膜',
      filmBrands:'3M', phone:'+1 323-800-2653 / +1 866-933-3456', website:'https://www.windowfilmdepot.com/locations/california/los-angeles/',
      directorySource:'https://findawrap.com/shops/los-angeles-ca/window-film-depot-home-commercial-window-tint-los-angeles-ca',
      serviceSources:['https://www.windowfilmdepot.com/locations/california/los-angeles/'], lat:34.0029027, lng:-118.2830187,
      researchNotes:'Official location page confirms residential, commercial, retail and government window film installation / 官方分店页面确认住宅、商业、零售及政府建筑窗膜安装',
      route:'C', visitRegion:'洛杉矶中心／东南区', visitBatch:'ARCH-LA-C-01', visitStop:1,
      referencePhotos:[{url:'https://www.windowfilmdepot.com/wp-content/uploads/2018/11/Los-angeles-california.jpg',fileName:'ARCH-LA002-official.jpg',contentType:'image/jpeg',sourceLabel:'Official website reference image; not a field check-in photo',sourceUrl:'https://www.windowfilmdepot.com/locations/california/los-angeles/'}]
    },
    {
      publicRecordId:'ARCH-LA003', businessName:'American Window Film Orange County', city:'Laguna Hills',
      address:'23042 Mill Creek Dr, Laguna Hills, CA 92653', distanceKm:82.9, distanceBand:'50–100 km / 公里',
      services:'Residential glass film / 住宅玻璃膜; Commercial glass film / 商业建筑玻璃膜; Solar and heat-control film / 隔热防晒膜; Safety and security film / 安全防爆膜; Decorative and privacy film / 装饰及隐私膜',
      filmBrands:'3M', phone:'+1 949-770-8969', website:'https://americanwindowfilm.com/locations/orange-county-window-film',
      directorySource:'https://findawrap.com/shops/laguna-hills-ca/american-window-film-commercial-home-window-laguna-hills-ca',
      serviceSources:['https://americanwindowfilm.com/locations/orange-county-window-film'], lat:33.627518, lng:-117.734933,
      researchNotes:'Official regional location serves residential and commercial architectural film projects / 官方区域分店提供住宅及商业建筑膜服务',
      route:'G', visitRegion:'橙县', visitBatch:'ARCH-LA-G-01', visitStop:1,
      referencePhotos:[{url:'https://americanwindowfilm.com/hubfs/orange-county-window-film/orange-county-window-film.jpg',fileName:'ARCH-LA003-official.jpg',contentType:'image/jpeg',sourceLabel:'Official website reference image; not a field check-in photo',sourceUrl:'https://americanwindowfilm.com/locations/orange-county-window-film'}]
    }
  ];

  for (const record of additions) {
    record.googleMapsUrl = mapUrl(record.businessName, record.address);
    record.navigationUrl = navigationUrl(origin, record.address);
    record.socialLinks = {};
    markArchitectural(record, record.services, record.researchNotes, record.serviceSources);
    addUnique(seed.records, record);
  }
  seed.records.sort((a, b) => String(a.route || '').localeCompare(String(b.route || ''))
    || String(a.visitBatch || '').localeCompare(String(b.visitBatch || ''), undefined, { numeric:true })
    || Number(a.visitStop || 0) - Number(b.visitStop || 0)
    || String(a.publicRecordId).localeCompare(String(b.publicRecordId)));
  seed.version = 'santa-monica-field-sales-2026-10-14-v2';
  seed.recordCount = seed.records.length;
  seed.photoCount = seed.records.reduce((sum, record) => sum + (record.referencePhotos || []).length, 0);
  fs.writeFileSync(file, `${JSON.stringify(seed, null, 2)}\n`);
}

function updateLasVegas() {
  const file = path.join(root, 'migrations', 'las-vegas-field-sales-2026-10-13.json');
  const seed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const origin = '3359 W Oquendo Rd, Las Vegas, NV 89118';

  applyExisting(
    seed.records,
    'LV056',
    'Residential glass film / 住宅玻璃膜; Commercial glass film / 商业建筑玻璃膜',
    'Official website and public listings identify commercial and residential window tinting / 官网及公开资料明确列出商业与住宅窗膜服务',
    ['https://millenniumtints.com/', 'https://millenniumtints.com/contact-us/']
  );
  applyExisting(
    seed.records,
    'LV058',
    'Residential glass film / 住宅玻璃膜; Commercial glass film / 商业建筑玻璃膜',
    'Public business listings identify residential and commercial window tinting / 公开商家资料明确列出住宅与商业窗膜服务',
    ['http://midnighttintlv.com/']
  );

  const additions = [
    {
      publicRecordId:'ARCH-LV001', businessName:'Golden State Window Tinting', city:'Las Vegas',
      address:'11822 Tres Bispos Ave, Las Vegas, NV 89138', distanceKm:21.8, distanceBand:'0–50 km / 公里',
      services:'Residential glass film / 住宅玻璃膜; Commercial glass film / 商业建筑玻璃膜; Solar and heat-control film / 隔热防晒膜',
      filmBrands:'', phone:'+1 702-646-5336', website:'http://www.windowtintinglasvegas.com/',
      directorySource:'https://findawrap.com/shops/las-vegas-nv/golden-state-window-tinting-residential-las-vegas-nv',
      serviceSources:['http://www.windowtintinglasvegas.com/'], lat:36.174274, lng:-115.3562164,
      researchNotes:'Public business listing identifies residential window tinting; confirm current commercial product range before visiting / 公开商家资料明确住宅窗膜业务，出访前确认当前商业产品线',
      route:'B', visitRegion:'西区／Summerlin', visitBatch:'ARCH-LV-B-01', visitStop:1,
      referencePhotos:[{url:'https://windowtintinglasvegas.com/wp-content/uploads/2025/10/unnamed-10.png',fileName:'ARCH-LV001-official.png',contentType:'image/png',sourceLabel:'Official website reference image; not a field check-in photo',sourceUrl:'https://windowtintinglasvegas.com/'}]
    },
    {
      publicRecordId:'ARCH-LV002', businessName:'Las Vegas Window Tinting', city:'Las Vegas',
      address:'5615 Cameron St Unit 2, Las Vegas, NV 89118', distanceKm:4.1, distanceBand:'0–50 km / 公里',
      services:'Residential glass film / 住宅玻璃膜; Commercial glass film / 商业建筑玻璃膜; Commercial security film / 商业安全膜; Decorative and privacy film / 装饰及隐私膜; Anti-graffiti film / 防涂鸦膜',
      filmBrands:'3M, Avery Dennison, Huper Optik', phone:'', website:'https://www.lvtint.com/', directorySource:'https://www.lvtint.com/',
      serviceSources:['https://www.lvtint.com/'], researchNotes:'Official website confirms home, commercial, security, decorative and anti-graffiti window film / 官网确认住宅、商业、安全、装饰及防涂鸦窗膜服务',
      route:'A', visitRegion:'公司周边／中南区', visitBatch:'ARCH-LV-A-01', visitStop:1, referencePhotos:[]
    },
    {
      publicRecordId:'ARCH-LV003', businessName:'WindowTintNV.com', city:'Las Vegas',
      address:'5820 Taj Mahal Dr, Las Vegas, NV 89130', distanceKm:18.3, distanceBand:'0–50 km / 公里',
      services:'Residential glass film / 住宅玻璃膜; Commercial glass film / 商业建筑玻璃膜; Security film / 安全防爆膜; Anti-graffiti film / 防涂鸦膜',
      filmBrands:'', phone:'+1 702-286-6095', website:'https://www.windowtintnv.com/', directorySource:'https://www.windowtintnv.com/',
      serviceSources:['https://www.windowtintnv.com/', 'https://www.windowtintnv.com/residential-commercial-film'], researchNotes:'Official website confirms automotive, residential and commercial window film installation / 官网确认汽车、住宅及商业窗膜安装服务',
      route:'C', visitRegion:'北区／北拉斯维加斯', visitBatch:'ARCH-LV-C-01', visitStop:1, referencePhotos:[]
    },
    {
      publicRecordId:'ARCH-LV004', businessName:'Pacific Tint', city:'Las Vegas',
      address:'8075 Rams Collide St, Las Vegas, NV 89166', distanceKm:26.7, distanceBand:'0–50 km / 公里',
      services:'Residential glass film / 住宅玻璃膜; Commercial glass film / 商业建筑玻璃膜; Security film / 安全防爆膜; Anti-graffiti film / 防涂鸦膜; Architectural surface finishes / 建筑表面装饰膜',
      filmBrands:'3M, DI-NOC, FASARA', phone:'+1 702-254-5054', website:'https://pacifictintlv.com/', directorySource:'https://pacifictintlv.com/',
      serviceSources:['https://pacifictintlv.com/'], researchNotes:'Official website confirms residential and commercial window tinting, security, graffiti protection and DI-NOC architectural finishes / 官网确认住宅商业窗膜、安全膜、防涂鸦膜及DI-NOC建筑饰面',
      route:'B', visitRegion:'西区／Summerlin', visitBatch:'ARCH-LV-B-01', visitStop:2, referencePhotos:[]
    }
  ];

  for (const record of additions) {
    record.googleMapsUrl = mapUrl(record.businessName, record.address);
    record.navigationUrl = navigationUrl(origin, record.address);
    record.socialLinks = {};
    markArchitectural(record, record.services, record.researchNotes, record.serviceSources);
    addUnique(seed.records, record);
  }
  seed.records.sort((a, b) => String(a.route || '').localeCompare(String(b.route || ''))
    || String(a.visitBatch || '').localeCompare(String(b.visitBatch || ''), undefined, { numeric:true })
    || Number(a.visitStop || 0) - Number(b.visitStop || 0)
    || String(a.publicRecordId).localeCompare(String(b.publicRecordId)));
  seed.version = 'las-vegas-field-sales-2026-10-14-v2';
  seed.recordCount = seed.records.length;
  seed.photoCount = seed.records.reduce((sum, record) => sum + (record.referencePhotos || []).length, 0);
  seed.routeCount = new Set(seed.records.map(record => record.route).filter(Boolean)).size;
  seed.batchCount = new Set(seed.records.map(record => record.visitBatch).filter(Boolean)).size;
  fs.writeFileSync(file, `${JSON.stringify(seed, null, 2)}\n`);
}

updateSantaMonica();
updateLasVegas();
