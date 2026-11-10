package com.pda.uhf_g.util;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import javax.net.ssl.HttpsURLConnection;

/**
 * Minimal HTTPS client for the QUAD safe RFID stocktake API.
 * The device key is sent only to the fixed QUAD production origin.
 */
public final class RfidApiClient {
    public static final String BASE_URL = "https://film-shop-management-production.up.railway.app";
    private final String deviceId;
    private final String deviceKey;

    public RfidApiClient(String deviceId, String deviceKey) {
        this.deviceId = deviceId == null ? "" : deviceId.trim();
        this.deviceKey = deviceKey == null ? "" : deviceKey.trim();
    }

    public JSONObject capabilities() throws Exception {
        return request("GET", "/api/inventory/rfid-receipts/capabilities", null);
    }

    public JSONObject catalog() throws Exception {
        return request("GET", "/api/inventory/rfid-catalog/items", null);
    }

    public JSONObject uploadStocktake(String requestId, JSONArray scans) throws Exception {
        JSONObject body = new JSONObject();
        body.put("requestId", requestId);
        body.put("deviceId", deviceId);
        body.put("branchId", "los-angeles");
        body.put("mode", "stocktake");
        body.put("scans", scans);
        return request("POST", "/api/inventory/rfid-receipts", body);
    }

    public JSONObject activate(String activationCode) throws Exception {
        JSONObject body = new JSONObject();
        body.put("deviceId", deviceId);
        body.put("activationCode", activationCode);
        return request("POST", "/api/inventory/rfid-devices/activate", body, false);
    }

    private JSONObject request(String method, String pathname, JSONObject body) throws Exception {
        return request(method, pathname, body, true);
    }

    private JSONObject request(String method, String pathname, JSONObject body, boolean authenticated) throws Exception {
        if (authenticated && !deviceKey.matches("[A-Za-z0-9_-]{40,128}")) {
            throw new IllegalStateException("设备密钥未设置或格式不正确");
        }
        HttpsURLConnection connection = (HttpsURLConnection) new URL(BASE_URL + pathname).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(20000);
        connection.setRequestMethod(method);
        connection.setRequestProperty("Accept", "application/json");
        if (authenticated) {
            connection.setRequestProperty("X-QEOS-Device-Key", deviceKey);
            connection.setRequestProperty("X-QEOS-Device-Id", deviceId);
        }
        if (body != null) {
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setFixedLengthStreamingMode(bytes.length);
            connection.setDoOutput(true);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }
        }
        int status = connection.getResponseCode();
        InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        StringBuilder text = new StringBuilder();
        if (stream != null) {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (text.length() > 200000) throw new IllegalStateException("服务器响应过大");
                    text.append(line);
                }
            }
        }
        connection.disconnect();
        JSONObject result = text.length() == 0 ? new JSONObject() : new JSONObject(text.toString());
        if (status < 200 || status >= 300) {
            throw new IllegalStateException(result.optString("error", "服务器错误 HTTP " + status));
        }
        return result;
    }
}
