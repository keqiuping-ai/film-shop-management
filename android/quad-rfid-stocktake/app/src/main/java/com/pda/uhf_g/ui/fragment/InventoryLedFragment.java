package com.pda.uhf_g.ui.fragment;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Bundle;
import android.os.Handler;
import android.os.Message;
import android.util.Log;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.Button;
import android.widget.ListView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.gg.reader.api.protocol.gx.LogBase6bInfo;
import com.pda.uhf_g.MainActivity;
import com.pda.uhf_g.R;
import com.pda.uhf_g.adapter.EPCListViewAdapter;
import com.pda.uhf_g.entity.TagInfo;
import com.pda.uhf_g.ui.base.BaseFragment;
import com.pda.uhf_g.util.LogUtil;
import com.pda.uhf_g.util.UtilSound;
import com.uhf.api.cls.Reader;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TimeZone;

import butterknife.BindView;
import butterknife.ButterKnife;
import butterknife.OnClick;
import cn.pda.serialport.Tools;

/**
 * 盘存界面，用于盘存6C/6B/GB/GJB标签
 * 模块固件版本说明：X.X.1.X表示通用版本（1或者3表示通用版本支持6c/b; 5表示GJB，6表示GB，7表示GJB和GB）
 */
public class InventoryLedFragment extends BaseFragment {


    @BindView(R.id.textView_led)
    TextView tvLedString;
    @BindView(R.id.button_inventory)
    Button btnInventory;
    @BindView(R.id.button_cus_read)
    Button btnCusRead;
    @BindView(R.id.button_clean)
    Button btnClean;

    @BindView(R.id.recycle)
    RecyclerView recyclerView;//EPC list


    @BindView(R.id.listview_epc)
    ListView listViewEPC;

    private EPCListViewAdapter epcListViewAdapter;
    private Map<String, TagInfo> tagInfoMap = new LinkedHashMap<String, TagInfo>();//去重数据源
    private List<TagInfo> tagInfoList = new ArrayList<TagInfo>();//适配器所需数据源
    private MainActivity mainActivity;
    private Long index = 1l;//索引

    private Handler soundHandler = new Handler();


    private boolean isReader = false;

    private long speed = 0;

    private SimpleDateFormat formatter = new SimpleDateFormat("HH:mm:ss");
    private KeyReceiver keyReceiver;


    private final int MSG_INVENROTY = 1;
    private final int MSG_INVENROTY_TIME = 1001;
    private boolean isMulti = false;// multi mode flag

    private long lastCount = 0;//

    private Runnable soundTask = null;

    private Handler handler = new Handler() {
        @Override
        public void handleMessage(@NonNull Message msg) {
            super.handleMessage(msg);

            switch (msg.what) {
                case MSG_INVENROTY:

                    //
                    long currentCount = getReadCount(tagInfoList);
                    speed = currentCount - lastCount;
                    if (speed >= 0) {
                        lastCount = currentCount;

                    }
                    break;

            }
        }
    };


    //初始化面板
    private void initPane() {
        index = 1l;
        tagInfoMap.clear();
        tagInfoList.clear();
        epcListViewAdapter.notifyDataSetChanged();


    }


    //获取读取总次数
    private long getReadCount(List<TagInfo> tagInfoList) {
        long readCount = 0;
        for (int i = 0; i < tagInfoList.size(); i++) {
            readCount += tagInfoList.get(i).getCount();
        }
        return readCount;
    }

    public InventoryLedFragment() {

    }


    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        mainActivity = (MainActivity) getActivity();

    }

    @Override
    public void onResume() {
        super.onResume();
        Log.e("pang", "onResume()");
        if (mainActivity.mUhfrManager != null)
            mainActivity.mUhfrManager.setCancleInventoryFilter();
        initView();
        //注册按键
        registerKeyCodeReceiver();
        //getModuleInfo() ;
    }

    @Override
    public void onPause() {
        super.onPause();
        Log.e("pang", "onPause()");
        stopInventory();
        //注销按键监听
        mainActivity.unregisterReceiver(keyReceiver);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();

    }

    String LedString = "";
    //盘存线程
    private Runnable invenrotyThread = new Runnable() {
        @Override
        public void run() {
            LogUtil.e("invenrotyThread is running");
            List<Reader.TAGINFO> listTag = null;
            if (!tvLedString.getText().toString().trim().equals("")) {
                byte[] bytes =  mainActivity.mUhfrManager.getTagDataByFilter(0, 4, 1, Tools.HexString2Bytes("000000000"), (short) 50, Tools.HexString2Bytes(tvLedString.getText().toString().trim()), 1, 2, true);
//                if(bytes!=null){
//                    UtilSound.play(1, 0);
//                }
            } else {
                listTag = mainActivity.mUhfrManager.tagEpcOtherInventoryByTimer((short) 50, 0, 4, 4, Tools.HexString2Bytes("000000000"));

                if (listTag != null && !listTag.isEmpty()) {
                    LogUtil.e("inventory listTag size = " + listTag.size());
                    UtilSound.play(1, 0);
                    for (Reader.TAGINFO taginfo : listTag) {
                        Map<String, TagInfo> infoMap = pooled6cData(taginfo);
                        tagInfoList.clear();
                        tagInfoList.addAll(infoMap.values());
                        mainActivity.listEPC.clear();
                        mainActivity.listEPC.addAll(infoMap.keySet());

                    }
                    epcListViewAdapter.notifyDataSetChanged();
                    handler.sendEmptyMessage(MSG_INVENROTY);

                } else {
                    //
                    speed = 0;
                }
//            }
            }
            //是否连续盘存
            handler.postDelayed(invenrotyThread, 0);

        }
    };


    //去重6C
    public Map<String, TagInfo> pooled6cData(Reader.TAGINFO info) {
        String epcAndTid = Tools.Bytes2HexString(info.EpcId, info.EpcId.length);
        if (tagInfoMap.containsKey(epcAndTid)) {
            TagInfo tagInfo = tagInfoMap.get(epcAndTid);
            Long count = tagInfo.getCount();
            count++;
            tagInfo.setRssi(info.RSSI + "");
            tagInfo.setCount(count);
            if (info.EmbededData != null && info.EmbededDatalen > 0) {
                tagInfo.setTid(Tools.Bytes2HexString(info.EmbededData, info.EmbededDatalen));
            }
            tagInfoMap.put(epcAndTid, tagInfo);
        } else {
            TagInfo tag = new TagInfo();
            tag.setIndex(index);
            tag.setType("6C");
            tag.setEpc(Tools.Bytes2HexString(info.EpcId, info.EpcId.length));
            tag.setCount(1l);
            if (info.EmbededData != null && info.EmbededDatalen > 0) {
                tag.setTid(Tools.Bytes2HexString(info.EmbededData, info.EmbededDatalen));
            }
            tag.setRssi(info.RSSI + "");
            tagInfoMap.put(epcAndTid, tag);
            index++;
        }
        return tagInfoMap;
    }



    /***清除***/
    @OnClick(R.id.button_clean)
    public void clear() {
        initPane();
        mainActivity.listEPC.clear();
        if (!tvLedString.getText().toString().trim().equals("")) {
            tvLedString.setText("");
            mainActivity.mUhfrManager.setCancleInventoryFilter() ;
        }
    }

    /***盘存EPC***/
    @OnClick(R.id.button_inventory)
    public void invenroty() {
        //操作之前判定模块是否正常初始化
        if (mainActivity.mUhfrManager == null) {
            showToast(R.string.communication_timeout);

            return;
        }
        if (!isReader) {
            inventoryEPC();
        } else {
            stopInventory();
        }

    }


    /***盘存EPC***/
    private void inventoryEPC() {
        isReader = true;
        inventory6C();

    }

    /**
     * 停止盘存
     **/
    private void stopInventory() {
        if (mainActivity.mUhfrManager != null) {
            if (isReader) {
//                if (isMulti && radioButton6C.isChecked()) {
//                }
                handler.removeCallbacks(invenrotyThread);
                soundHandler.removeCallbacks(soundTask);
                isReader = false;


                btnInventory.setText(R.string.start_inventory);
            }

        } else {
            showToast(R.string.communication_timeout);
        }
        isReader = false;
    }

    /***盘存6C标签**/
    private void inventory6C() {
        isReader = true;
        speed = 0;//
        btnInventory.setText(R.string.stop_inventory);

        showToast(R.string.start_inventory);

        mainActivity.mUhfrManager.setGen2session(1);

        //启动盘存线程
        handler.postDelayed(invenrotyThread, 0);
    }

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container,
                             Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_inventory_led, container, false);
        ButterKnife.bind(this, view);


        //初始化声音池
        UtilSound.initSoundPool(mainActivity);
        return view;
    }

    /**
     * 注册按键监听
     **/
    private void registerKeyCodeReceiver() {
        keyReceiver = new KeyReceiver();
        IntentFilter filter = new IntentFilter();
        filter.addAction("android.rfid.FUN_KEY");
        filter.addAction("android.intent.action.FUN_KEY");
        mainActivity.registerReceiver(keyReceiver, filter);
    }

    private void initView() {
        epcListViewAdapter = new EPCListViewAdapter(mainActivity, tagInfoList);
        listViewEPC.setAdapter(epcListViewAdapter);
        listViewEPC.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                if(tagInfoList.get(position).getEpc().equals(LedString)){
                    LedString = "";
                }else {
                    LedString = tagInfoList.get(position).getEpc();
                }
                tvLedString.setText(LedString);
            }
        });

    }


    //按键广播接收
    private class KeyReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            int keyCode = intent.getIntExtra("keyCode", 0);
            LogUtil.e("keyCode = " + keyCode);
            if (keyCode == 0) {
                keyCode = intent.getIntExtra("keycode", 0);
            }
            boolean keyDown = intent.getBooleanExtra("keydown", false);
            if (keyDown) {
//                ToastUtils.showText("KeyReceiver:keyCode = down" + keyCode);
            } else {
//                ToastUtils.showText("KeyReceiver:keyCode = up" + keyCode);
                switch (keyCode) {
                    case KeyEvent.KEYCODE_F1:
                        break;
                    case KeyEvent.KEYCODE_F2:
                        break;

                    case KeyEvent.KEYCODE_F3:
                        break;
                    case KeyEvent.KEYCODE_F5:
                    case KeyEvent.KEYCODE_F4://6100
                    case KeyEvent.KEYCODE_F7://H3100
                        invenroty();
                        break;
                }
            }
        }

    }
}