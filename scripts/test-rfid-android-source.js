const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const clientPath = path.join(root, 'android/quad-rfid-stocktake/app/src/main/java/com/pda/uhf_g/util/RfidApiClient.java');
const fragmentPath = path.join(root, 'android/quad-rfid-stocktake/app/src/main/java/com/pda/uhf_g/ui/fragment/InventoryFragment.java');
const manifestPath = path.join(root, 'android/quad-rfid-stocktake/app/src/main/AndroidManifest.xml');
const gradlePath = path.join(root, 'android/quad-rfid-stocktake/app/build.gradle');
const mainActivityPath = path.join(root, 'android/quad-rfid-stocktake/app/src/main/java/com/pda/uhf_g/MainActivity.java');
const layoutPath = path.join(root, 'android/quad-rfid-stocktake/app/src/main/res/layout/fragment_inventory.xml');

for (const file of [clientPath, fragmentPath, manifestPath, gradlePath, mainActivityPath, layoutPath]) {
  assert(fs.existsSync(file), `Missing Android source file: ${file}`);
}

const client = fs.readFileSync(clientPath, 'utf8');
const fragment = fs.readFileSync(fragmentPath, 'utf8');
const manifest = fs.readFileSync(manifestPath, 'utf8');
const gradle = fs.readFileSync(gradlePath, 'utf8');
const mainActivity = fs.readFileSync(mainActivityPath, 'utf8');
const layout = fs.readFileSync(layoutPath, 'utf8');
const combined = `${client}\n${fragment}\n${manifest}\n${gradle}\n${mainActivity}\n${layout}`;

assert(client.includes('https://film-shop-management-production.up.railway.app'), 'Production origin is not fixed');
assert(client.includes('/api/inventory/rfid-receipts/capabilities'), 'Missing safe capability check');
assert(client.includes('/api/inventory/rfid-catalog/items'), 'Missing catalog sync endpoint');
assert(client.includes('/api/inventory/rfid-devices/activate'), 'Missing six-digit activation endpoint');
assert(client.includes('body.put("mode", "stocktake")'), 'Upload mode is not stocktake');
assert(fragment.includes('inventoryMutationEnabled'), 'App does not verify server safe mode');
assert(fragment.includes('库存未改变'), 'UI does not communicate no-mutation behavior');
assert(fragment.includes('activateWithCode'), 'App does not accept a six-digit activation code');
assert(fragment.includes('applyScanMode'), 'App does not provide UHF/barcode mode switching');
assert(fragment.includes('ambiguousCatalogCodes'), 'Barcode mode must reject non-unique product barcodes');
assert(mainActivity.includes('enableBarcodeScanner'), 'App does not enable the red-dot barcode engine');
assert(mainActivity.includes('setBarcodeSendMode(1)'), 'Barcode result must be delivered to the focused scan field');
assert(layout.includes('radio_mode_barcode'), 'Barcode mode selector is missing');
assert(gradle.includes('versionName "1.0.2"'), 'Unexpected scanner app version');
assert(gradle.includes('applicationId "com.quadfilm.rfid.stocktake"'), 'Unexpected application ID');
assert(manifest.includes('android:allowBackup="false"'), 'Android backup must stay disabled');
assert(!/lidaqeos\.com/i.test(combined), 'Legacy vendor server must not be present');
assert(!/stockDelta/i.test(combined), 'Legacy scan-as-receipt contract must not be present');

console.log('RFID Android source contract passed: safe stocktake only, fixed QUAD origin, no legacy receipt mutation.');
