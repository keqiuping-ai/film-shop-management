(function () {
  'use strict';
  const STORE = 'quadCustomer.locale';
  const supported = ['en', 'ja', 'ko', 'es-MX', 'zh-CN'];
  const localeNames = {
    en:{en:'English',ja:'Japanese',ko:'Korean','es-MX':'Spanish','zh-CN':'Chinese'},
    ja:{en:'英語',ja:'日本語',ko:'韓国語','es-MX':'スペイン語','zh-CN':'中国語'},
    ko:{en:'영어',ja:'일본어',ko:'한국어','es-MX':'스페인어','zh-CN':'중국어'},
    'es-MX':{en:'Inglés',ja:'Japonés',ko:'Coreano','es-MX':'Español','zh-CN':'Chino'},
    'zh-CN':{en:'英语',ja:'日语',ko:'韩语','es-MX':'西班牙语','zh-CN':'中文'}
  };
  let locale = supported.includes(localStorage.getItem(STORE)) ? localStorage.getItem(STORE) : 'en';

  const rows = [
    ['Language','言語','언어','Idioma','语言'],
    ['DEALER LOGIN','販売店ログイン','딜러 로그인','INICIAR SESIÓN','经销商登录'],
    ['PROTECTION FOR EVERY JOURNEY','あらゆる旅を守る','모든 여정을 위한 보호','PROTECCIÓN PARA CADA VIAJE','守护每一次旅程'],
    ['Advanced film technology for automotive, architectural, and marine applications.','自動車・建築・船舶向けの先進フィルム技術。','자동차·건축·선박용 첨단 필름 기술.','Tecnología avanzada de películas para aplicaciones automotrices, arquitectónicas y marinas.','面向汽车、建筑和船舶应用的先进薄膜技术。'],
    ['Professional window film, paint protection film, color wrap, and architectural safety film solutions—supported by our U.S. team and global manufacturing capabilities.','米国チームとグローバルな製造力が支える、ウインドウフィルム、PPF、カーラッピング、建築用安全フィルム。','미국 팀과 글로벌 제조 역량이 지원하는 윈도 필름, PPF, 컬러 랩 및 건축 안전 필름 솔루션.','Soluciones profesionales de película para ventanas, PPF, rotulación de color y seguridad arquitectónica, respaldadas por nuestro equipo de EE. UU. y fabricación global.','由美国团队与全球制造能力支持的专业窗膜、漆面保护膜、改色膜及建筑安全膜解决方案。'],
    ['EXPLORE PRODUCTS','製品を見る','제품 보기','VER PRODUCTOS','浏览产品'],
    ['DEALER ORDERING','販売店発注','딜러 주문','PEDIDOS DE DISTRIBUIDOR','经销商订购'],
    ['NEW PRODUCT · FEATURED RELEASE','新製品・注目の新作','신제품 · 주요 출시','NUEVO PRODUCTO · LANZAMIENTO DESTACADO','新产品 · 重点发布'],
    ['Tesla Panoramic Roof Exterior Heat-Rejection Film','テスラ・パノラマルーフ外貼り遮熱フィルム','테슬라 파노라마 루프 외부 시공 열차단 필름','Película exterior de rechazo de calor para techo panorámico Tesla','特斯拉全景天幕外贴隔热膜'],
    ['Tesla Panoramic Roof','テスラ・パノラマルーフ','테슬라 파노라마 루프','Techo panorámico Tesla','特斯拉全景天幕'],
    ['Exterior Heat-Rejection Film','外貼り遮熱フィルム','외부 시공 열차단 필름','Película exterior de rechazo de calor','外贴隔热膜'],
    ['DISCOVER THE PRODUCT','製品の詳細','제품 알아보기','CONOCER EL PRODUCTO','了解本产品'],
    ['SHOP BY APPLICATION','用途から選ぶ','용도별 쇼핑','COMPRAR POR APLICACIÓN','按应用选购'],
    ['Explore Our Film Categories','フィルムカテゴリーを見る','필름 카테고리 둘러보기','Explore nuestras categorías de película','浏览我们的膜类产品'],
    ['Paint Protection Film','ペイントプロテクションフィルム','도장 보호 필름','Película de protección de pintura','漆面保护膜'],
    ['Color Change Wrap','カラーチェンジラップ','컬러 체인지 랩','Vinilo de cambio de color','汽车改色膜'],
    ['Window Film | Tesla Roof Film','ウインドウフィルム｜テスラルーフフィルム','윈도 필름 | 테슬라 루프 필름','Película para ventanas | Techo Tesla','窗膜｜特斯拉车顶膜'],
    ['Architectural Film','建築用フィルム','건축용 필름','Película arquitectónica','建筑膜'],
    ['Interior Surface Film','内装表面フィルム','인테리어 표면 필름','Película para superficies interiores','家居膜'],
    ['Yacht Protection Film','ヨット保護フィルム','요트 보호 필름','Película de protección para yates','游艇保护膜'],
    ['ENTER DEALER ORDERING','販売店発注へ','딜러 주문 시작','ENTRAR A PEDIDOS','进入经销商订购'],
    ['← BRAND HOME','← ブランドホーム','← 브랜드 홈','← INICIO DE MARCA','← 返回品牌首页'],
    ['DEALER ORDERING CENTER','販売店発注センター','딜러 주문 센터','CENTRO DE PEDIDOS','经销商订购中心'],
    ['Select a Product Category','製品カテゴリーを選択','제품 카테고리 선택','Seleccione una categoría','选择产品分类'],
    ['QUAD FILM · PROFESSIONAL DEALER PORTAL','QUAD FILM・プロ販売店ポータル','QUAD FILM · 전문 딜러 포털','QUAD FILM · PORTAL PROFESIONAL PARA DISTRIBUIDORES','QUAD FILM · 专业经销商平台'],
    ['Choose a category to view its product series, specifications, colors, sizes, and dealer ordering options.','カテゴリーを選び、シリーズ、仕様、色、サイズ、販売店向け発注項目を確認してください。','카테고리를 선택하여 제품 시리즈, 사양, 색상, 크기 및 딜러 주문 옵션을 확인하세요.','Elija una categoría para ver series, especificaciones, colores, tamaños y opciones de pedido.','选择分类，查看产品系列、规格、颜色、尺寸及经销商订购选项。'],
    ['ORDERING CENTER PREVIEW','発注センター','주문 센터','CENTRO DE PEDIDOS','订购中心'],
    ['Product pricing, payment, and live inventory are not connected yet.','価格、決済、リアルタイム在庫はQUaDシステムから提供されます。','가격, 결제 및 실시간 재고는 QUaD 시스템에서 제공됩니다.','Los precios, pagos e inventario en vivo son proporcionados por el sistema QUaD.','价格、付款及实时库存由 QUaD 系统提供。'],
    ['01 · AUTOMOTIVE PROTECTION','01・自動車保護','01 · 자동차 보호','01 · PROTECCIÓN AUTOMOTRIZ','01 · 汽车保护'],
    ['02 · COLOR & FINISH','02・カラーと仕上げ','02 · 색상 및 마감','02 · COLOR Y ACABADO','02 · 色彩与质感'],
    ['03 · SOLAR CONTROL','03・日射制御','03 · 태양열 차단','03 · CONTROL SOLAR','03 · 隔热控制'],
    ['04 · BUILDING PERFORMANCE','04・建築性能','04 · 건축 성능','04 · RENDIMIENTO ARQUITECTÓNICO','04 · 建筑性能'],
    ['05 · INTERIOR RENOVATION','05・内装リノベーション','05 · 인테리어 리노베이션','05 · RENOVACIÓN INTERIOR','05 · 室内翻新'],
    ['06 · MARINE PROTECTION','06・船舶保護','06 · 선박 보호','06 · PROTECCIÓN MARINA','06 · 船艇保护'],
    ['Clear, matte, and specialty-effect PPF for premium automotive applications.','高級車向けのクリア、マット、特殊効果PPF。','프리미엄 자동차용 투명, 무광 및 특수 효과 PPF.','PPF transparente, mate y de efectos especiales para aplicaciones automotrices premium.','适用于高端汽车的透明、哑光及特殊效果 PPF。'],
    ['Browse colors, finishes, textures, and product codes for complete vehicle transformations.','色、仕上げ、質感、製品コードからフルラッピングを選択。','색상, 마감, 질감 및 제품 코드로 전체 차량 랩을 선택하세요.','Explore colores, acabados, texturas y códigos para transformar vehículos completos.','浏览颜色、表面效果、纹理及产品编号，完成整车改色。'],
    ['Automotive heat rejection, UV protection, privacy, and panoramic roof solutions.','自動車の遮熱、UV保護、プライバシー、パノラマルーフ対策。','자동차 열 차단, 자외선 보호, 프라이버시 및 파노라마 루프 솔루션.','Soluciones automotrices de rechazo de calor, protección UV, privacidad y techo panorámico.','汽车隔热、紫外线防护、隐私及全景车顶解决方案。'],
    ['Heat-control, privacy, decorative, safety, and security films for residential and commercial glass.','住宅・商業ガラス向けの遮熱、プライバシー、装飾、防災、防犯フィルム。','주거 및 상업용 유리를 위한 열 차단, 프라이버시, 장식, 안전 및 보안 필름.','Películas de control térmico, privacidad, decoración, seguridad y protección para vidrio residencial y comercial.','适用于住宅和商业玻璃的隔热、隐私、装饰、安全及防护膜。'],
    ['Decorative and protective finishes for countertops, cabinetry, furniture, and walls.','カウンター、キャビネット、家具、壁用の装飾・保護仕上げ。','상판, 캐비닛, 가구 및 벽을 위한 장식 및 보호 마감재.','Acabados decorativos y protectores para encimeras, gabinetes, muebles y paredes.','适用于台面、橱柜、家具及墙面的装饰保护膜。'],
    ['Marine-focused PPF for gelcoat, high-gloss paint, exterior surfaces, and yacht interiors.','ゲルコート、高光沢塗装、外装、ヨット内装向けの船舶用PPF。','젤코트, 고광택 도장, 외부 표면 및 요트 실내용 해양 PPF.','PPF marino para gelcoat, pintura brillante, exteriores e interiores de yates.','适用于胶衣、高光漆面、船体外部及游艇内饰的船艇 PPF。'],
    ['ENTER PPF CATALOG','PPFカタログへ','PPF 카탈로그','ENTRAR AL CATÁLOGO PPF','进入 PPF 产品目录'],
    ['ENTER COLOR WRAP CATALOG','ラップカタログへ','컬러 랩 카탈로그','ENTRAR A VINILOS','进入改色膜产品目录'],
    ['ENTER WINDOW FILM CATALOG','ウインドウフィルムへ','윈도 필름 카탈로그','ENTRAR A PELÍCULAS PARA VENTANAS','进入窗膜产品目录'],
    ['ENTER ARCHITECTURAL CATALOG','建築用カタログへ','건축용 카탈로그','ENTRAR AL CATÁLOGO ARQUITECTÓNICO','进入建筑膜产品目录'],
    ['ENTER INTERIOR FILM CATALOG','内装フィルムへ','인테리어 필름 카탈로그','ENTRAR A PELÍCULAS INTERIORES','进入家居膜产品目录'],
    ['ENTER YACHT FILM CATALOG','ヨットフィルムへ','요트 필름 카탈로그','ENTRAR A PELÍCULAS PARA YATES','进入游艇膜产品目录'],
    ['← BACK TO HOME','← ホームへ戻る','← 홈으로','← VOLVER AL INICIO','← 返回首页'],
    ['Dealer Ordering Login','販売店発注ログイン','딜러 주문 로그인','Inicio de sesión de distribuidor','经销商采购登录'],
    ['Sign in to view your pricing, place orders, and track deliveries.','ログインして契約価格の確認、発注、配送追跡を行えます。','로그인하여 전용 가격 확인, 주문 및 배송 추적을 이용하세요.','Inicie sesión para ver sus precios, hacer pedidos y rastrear entregas.','登录后查看专属价格、提交订单并跟踪物流。'],
    ['Account / Email / Phone','アカウント／メール／電話','계정 / 이메일 / 전화','Cuenta / Correo / Teléfono','账号 / 邮箱 / 电话'],
    ['Password','パスワード','비밀번호','Contraseña','密码'],
    ['SIGN IN','ログイン','로그인','INICIAR SESIÓN','登录'],
    ['← PRODUCT HOME','← 製品ホーム','← 제품 홈','← INICIO DE PRODUCTOS','← 返回产品首页'],
    ['SIGN OUT','ログアウト','로그아웃','CERRAR SESIÓN','退出登录'],
    ['MY ORDERS','注文履歴','내 주문','MIS PEDIDOS','我的订单'],
    ['MY ACCOUNT','アカウント','내 계정','MI CUENTA','我的账户'],
    ['← 返回产品分类','← 製品カテゴリーへ','← 제품 카테고리','← VOLVER A CATEGORÍAS','← 返回产品分类'],
    ['经销商登录','販売店ログイン','딜러 로그인','INICIAR SESIÓN','经销商登录'],
    ['PPF 产品订购页','PPF製品発注','PPF 제품 주문','Pedido de productos PPF','PPF 产品订购页'],
    ['PPF 产品订购','PPF製品発注','PPF 제품 주문','Pedido de productos PPF','PPF 产品订购'],
    ['高亮透明 PPF','高光沢クリアPPF','고광택 투명 PPF','PPF transparente de alto brillo','高亮透明 PPF'],
    ['深哑光 PPF','ディープマットPPF','딥 매트 PPF','PPF mate profundo','深哑光 PPF'],
    ['缎面 PPF','サテンPPF','새틴 PPF','PPF satinado','缎面 PPF'],
    ['重点部位保护膜','部分保護フィルム','주요 부위 보호 필름','Película para áreas críticas','重点部位保护膜'],
    ['游艇表面保护膜','ヨット表面保護フィルム','요트 표면 보호 필름','Película protectora para yates','游艇表面保护膜'],
    ['具体型号','型番','세부 모델','Modelo','具体型号'],
    ['请选择具体型号','型番を選択','모델 선택','Seleccione el modelo','请选择具体型号'],
    ['规格','サイズ','규격','Tamaño','规格'],
    ['请选择规格','サイズを選択','규격 선택','Seleccione el tamaño','请选择规格'],
    ['数量','数量','수량','Cantidad','数量'],
    ['＋ 添加另一个型号','＋ 別の型番を追加','＋ 다른 모델 추가','＋ Agregar otro modelo','＋ 添加另一个型号'],
    ['＋ ADD TO CART','＋ カートに追加','＋ 장바구니에 추가','＋ Agregar al carrito','＋ 加入购物车'],
    ['删除这一项','この項目を削除','이 항목 삭제','Eliminar este artículo','删除这一项'],
    ['透明系列','クリアシリーズ','투명 시리즈','SERIE TRANSPARENTE','透明系列'],
    ['高雾度系列','ディープマットシリーズ','딥 매트 시리즈','SERIE MATE PROFUNDO','高雾度系列'],
    ['轻雾度系列','サテンシリーズ','새틴 시리즈','SERIE SATINADA','轻雾度系列'],
    ['专项保护系列','部分保護シリーズ','부분 보호 시리즈','SERIE DE PROTECCIÓN ESPECIAL','专项保护系列'],
    ['船艇应用系列','マリンシリーズ','마린 시리즈','SERIE MARINA','船艇应用系列'],
    ['选择此产品','この製品を選択','이 제품 선택','Seleccionar este producto','选择此产品'],
    ['查看购物车并去结账 →','カートを確認して会計 →','장바구니 및 결제 →','Ver carrito y pagar →','查看购物车并去结账 →'],
    ['改色膜产品订购页','ラップ製品発注','컬러 랩 주문','Pedido de vinilo','改色膜产品订购页'],
    ['选择改色膜颜色','ラップカラーを選択','랩 색상 선택','Seleccione color de vinilo','选择改色膜颜色'],
    ['全部','すべて','전체','Todos','全部'],
    ['亮光','グロス','유광','Brillante','亮光'],
    ['缎面','サテン','새틴','Satinado','缎面'],
    ['哑光','マット','무광','Mate','哑光'],
    ['搜索型号或颜色名称','型番または色名を検索','모델 또는 색상 검색','Buscar modelo o color','搜索型号或颜色名称'],
    ['加入选色清单','選択リストに追加','선택 목록에 추가','Agregar a selección','加入选色清单'],
    ['下一步：核对订单 →','次へ：注文確認 →','다음: 주문 확인 →','Siguiente: revisar pedido →','下一步：核对订单 →'],
    ['定制彩绘膜','カスタムプリントラップ','맞춤 그래픽 랩','Vinilo gráfico personalizado','定制彩绘膜'],
    ['选择图片或设计文件','画像またはデザインを選択','이미지 또는 디자인 선택','Seleccionar imagen o diseño','选择图片或设计文件'],
    ['窗膜产品订购页','ウインドウフィルム発注','윈도 필름 주문','Pedido de película para ventanas','窗膜产品订购页'],
    ['选择窗膜型号','ウインドウフィルムを選択','윈도 필름 모델 선택','Seleccione película para ventanas','选择窗膜型号'],
    ['透光率','可視光透過率','가시광선 투과율','Transmisión de luz','透光率'],
    ['隔热率','遮熱率','열 차단율','Rechazo de calor','隔热率'],
    ['加入订单','注文に追加','주문에 추가','Agregar al pedido','加入订单'],
    ['当前订单','現在の注文','현재 주문','Pedido actual','当前订单'],
    ['去结账','会計へ','결제하기','Ir a pagar','去结账'],
    ['继续添加产品','製品を追加','제품 계속 추가','Seguir agregando productos','继续添加产品'],
    ['收货信息','配送情報','배송 정보','Datos de entrega','收货信息'],
    ['公司 / 门店名称','会社／店舗名','회사 / 매장명','Empresa / Tienda','公司 / 门店名称'],
    ['收货人','受取人','수령인','Destinatario','收货人'],
    ['联系电话','電話番号','연락처','Teléfono','联系电话'],
    ['街道地址','住所','도로명 주소','Dirección','街道地址'],
    ['城市','市区町村','도시','Ciudad','城市'],
    ['州','州','주','Estado','州'],
    ['邮编','郵便番号','우편번호','Código postal','邮编'],
    ['配送方式','受取方法','배송 방법','Método de entrega','配送方式'],
    ['拉斯维加斯仓库自提','ラスベガス倉庫受取','라스베이거스 창고 픽업','Recoger en almacén de Las Vegas','拉斯维加斯仓库自提'],
    ['洛杉矶仓库自提','ロサンゼルス倉庫受取','로스앤젤레스 창고 픽업','Recoger en almacén de Los Ángeles','洛杉矶仓库自提'],
    ['快递 / 物流发货','宅配／貨物輸送','택배 / 화물 배송','Envío por paquetería / carga','快递 / 物流发货'],
    ['付款方式','支払方法','결제 방법','Método de pago','付款方式'],
    ['信用卡 / 借记卡','クレジット／デビットカード','신용 / 직불카드','Tarjeta de crédito / débito','信用卡 / 借记卡'],
    ['订单备注','注文メモ','주문 메모','Notas del pedido','订单备注'],
    ['付款明细','お支払い明細','결제 내역','Resumen de pago','付款明细'],
    ['批发价','卸売価格','도매가','Precio mayorista','批发价'],
    ['客户价格等级','お客様価格ランク','고객 가격 등급','Nivel de precio','客户价格等级'],
    ['本单专属优惠','今回の割引','이번 주문 할인','Descuento del pedido','本单专属优惠'],
    ['折后商品小计','割引後小計','할인 후 소계','Subtotal con descuento','折后商品小计'],
    ['配送费','送料','배송비','Envío','配送费'],
    ['销售税','消費税','판매세','Impuesto','销售税'],
    ['应付总额','お支払い合計','결제 총액','Total a pagar','应付总额'],
    ['继续信用卡 / Apple Pay 付款','カード／Apple Payで支払う','카드 / Apple Pay로 결제','Pagar con tarjeta / Apple Pay','继续信用卡 / Apple Pay 付款'],
    ['正在核价并检查库存…','価格と在庫を確認中…','가격 및 재고 확인 중…','Verificando precio e inventario…','正在核价并检查库存…'],
    ['订单与应收','注文と売掛金','주문 및 미수금','Pedidos y cuentas por cobrar','订单与应收'],
    ['质保与往来','保証と履歴','보증 및 기록','Garantía e historial','质保与往来'],
    ['No orders yet.','注文はまだありません。','아직 주문이 없습니다.','Aún no hay pedidos.','暂无订单。'],
    ['No warranty records yet.','保証記録はまだありません。','아직 보증 기록이 없습니다.','Aún no hay registros de garantía.','暂无质保记录。'],
    ['Paid','支払済み','결제 완료','Pagado','已付款'],
    ['Pending payment','支払待ち','결제 대기','Pago pendiente','待付款'],
    ['Shipped','発送済み','배송됨','Enviado','已发货'],
    ['Delivered','配達済み','배송 완료','Entregado','已送达'],
    ['1.52 m × 15 m','1.52 m × 15 m','1.52 m × 15 m','1.52 m × 15 m','1.52 米 × 15 米'],
    ['1.2 m × 30 m','1.2 m × 30 m','1.2 m × 30 m','1.2 m × 30 m','1.2 米 × 30 米'],
    ['Engineered for large panoramic glass roofs, this exterior-applied film reflects solar energy before it enters the vehicle. Its highly conformable construction stretches into place without heat forming for a faster, cleaner installation.','大型パノラマガラスルーフ用に設計。外貼りフィルムが太陽熱を車内に入る前に反射し、熱成形なしで素早くきれいに施工できます。','대형 파노라마 글라스 루프용 외부 시공 필름으로 태양열 유입을 차단하며, 열성형 없이 빠르고 깔끔하게 시공할 수 있습니다.','Diseñada para techos panorámicos grandes, esta película exterior refleja la energía solar antes de que entre al vehículo y se instala rápidamente sin termoformado.','专为大型全景玻璃车顶设计，外贴结构在热量进入车内前反射太阳能，无需烘烤即可快速施工。'],
    ['EXTERIOR HEAT REJECTION','外貼り遮熱','외부 열 차단','RECHAZO DE CALOR EXTERIOR','外贴隔热'],
    ['NO HEAT FORMING','熱成形不要','열성형 불필요','SIN TERMOFORMADO','无需烘烤'],
    ['FAST STRETCH INSTALLATION','素早いストレッチ施工','빠른 스트레치 시공','INSTALACIÓN RÁPIDA POR ESTIRAMIENTO','快速拉伸施工'],
    ['TESLA ROOF FILM · WATCH THE VIDEO','テスラルーフフィルム・動画を見る','테슬라 루프 필름 · 영상 보기','PELÍCULA DE TECHO TESLA · VER VIDEO','特斯拉车顶膜 · 观看视频'],
    ['QUAD FILM IN 18 SECONDS','18秒でわかるQUAD FILM','18초로 보는 QUAD FILM','QUAD FILM EN 18 SEGUNDOS','18秒了解 QUAD FILM'],
    ['From material development to dependable manufacturing.','材料開発から信頼できる製造まで。','소재 개발부터 신뢰할 수 있는 제조까지.','Del desarrollo de materiales a una fabricación confiable.','从材料研发到可靠制造。'],
    ['See our material testing, precision equipment, film production lines, and on-site quality control—the capabilities behind every QUaD product.','材料試験、精密設備、フィルム生産ライン、現場品質管理をご覧ください。すべてのQUaD製品を支える力です。','소재 시험, 정밀 장비, 필름 생산 라인 및 현장 품질 관리를 확인하세요. 모든 QUaD 제품의 기반입니다.','Conozca nuestras pruebas de materiales, equipos de precisión, líneas de producción y control de calidad: la capacidad detrás de cada producto QUaD.','了解我们的材料测试、精密设备、薄膜生产线及现场质量控制——这是每一款 QUaD 产品背后的实力。'],
    ['At the heart of global automotive culture.','世界の自動車文化の中心で。','글로벌 자동차 문화의 중심에서.','En el corazón de la cultura automotriz mundial.','置身全球汽车文化中心。'],
    ['At leading U.S. industry events, QUaD connects with premium vehicles, color-wrap culture, professional installers, and specialty shops.','米国の主要イベントで、QUaDは高級車、ラッピング文化、プロ施工者、専門店とつながります。','미국 주요 산업 행사에서 QUaD는 프리미엄 차량, 랩 문화, 전문 시공자 및 전문 매장과 만납니다.','En los principales eventos de EE. UU., QUaD conecta con vehículos premium, cultura del wrap, instaladores profesionales y tiendas especializadas.','在美国领先行业活动中，QUaD 与高端汽车、改色文化、专业施工人员及特色门店紧密连接。'],
    ['U.S. EVENTS · PREMIUM VEHICLES · INDUSTRY COMMUNITY','米国イベント・高級車・業界コミュニティ','미국 행사 · 프리미엄 차량 · 업계 커뮤니티','EVENTOS EN EE. UU. · VEHÍCULOS PREMIUM · COMUNIDAD PROFESIONAL','美国活动 · 高端汽车 · 行业社群'],
    ['THE QUAD FILM STORY','QUAD FILMの物語','QUAD FILM 스토리','LA HISTORIA DE QUAD FILM','QUAD FILM 品牌故事'],
    ['At leading U.S. industry events, QUaD connects with premium vehicles, color-wrap culture, professional installers, and specialty shops.','米国を代表する業界イベントで、QUaDは高級車、カーラッピング文化、プロ施工店、専門ショップとつながります。','미국 주요 산업 행사에서 QUaD는 프리미엄 차량, 랩핑 문화, 전문 시공자 및 전문 매장과 함께합니다.','En los principales eventos del sector en Estados Unidos, QUaD conecta con vehículos premium, la cultura del rotulado, instaladores profesionales y tiendas especializadas.','在美国重要行业活动中，QUaD 与高端汽车、改色文化、专业施工团队及专营门店紧密交流。'],
    ['The QUaD mark belongs in truly professional installations.','QUaDのマークは、本物のプロ施工にふさわしい証です。','QUaD 마크는 진정한 전문 시공의 상징입니다.','La marca QUaD pertenece a instalaciones verdaderamente profesionales.','QUaD 标志代表真正专业的施工品质。'],
    ['From the complex curves of professional race cars to everyday vehicles, QUaD demonstrates clarity, conformability, and protection through real products, professional tools, and finished installations.','プロレーシングカーの複雑な曲面から日常の車まで、QUaDは実製品、専門工具、完成施工を通じて透明感、追従性、保護性能を示します。','프로 레이싱카의 복잡한 곡면부터 일상 차량까지, QUaD는 실제 제품과 전문 도구, 완성 시공을 통해 선명도와 밀착성, 보호 성능을 보여줍니다.','Desde las curvas complejas de autos de competición hasta los vehículos cotidianos, QUaD demuestra claridad, adaptabilidad y protección con productos reales, herramientas profesionales e instalaciones terminadas.','从专业赛车的复杂曲面到日常车辆，QUaD 通过真实产品、专业工具和完工案例展现清晰度、延展贴合性与保护性能。'],
    ['QUaD Brand & Products','QUaDブランドと製品','QUaD 브랜드와 제품','Marca y productos QUaD','QUaD 品牌与产品'],
    ['Race car, film, tools, and branded packaging','レーシングカー、フィルム、工具、ブランド包装','레이싱카, 필름, 도구 및 브랜드 포장','Auto de carreras, película, herramientas y empaque de marca','赛车、膜材、工具及品牌包装'],
    ['The QUaD Mark','QUaDの証','QUaD 마크','La marca QUaD','QUaD 标志'],
    ['Our brand alongside high-performance racing','ハイパフォーマンスレースとともにある私たちのブランド','고성능 레이싱과 함께하는 브랜드','Nuestra marca junto al automovilismo de alto rendimiento','与高性能赛车并肩的品牌'],
    ['Real Installation','実際の施工','실제 시공','Instalación real','真实施工'],
    ['Precision application on complex surfaces','複雑な面への精密施工','복잡한 표면의 정밀 시공','Aplicación precisa en superficies complejas','复杂表面的精准施工'],
    ['Premium Applications','プレミアム施工','프리미엄 적용','Aplicaciones premium','高端应用'],
    ['Motorsport-grade surface protection','モータースポーツ品質の表面保護','모터스포츠급 표면 보호','Protección de superficies de nivel automovilístico','赛车级表面保护'],
    ['Discover the performance, applications, and real-world results of each film category before entering the professional ordering catalog.','プロ向け注文カタログに進む前に、各フィルムの性能、用途、実例をご覧ください。','전문 주문 카탈로그에 들어가기 전에 각 필름의 성능, 용도와 실제 결과를 확인하세요.','Conozca el rendimiento, las aplicaciones y los resultados reales de cada categoría antes de entrar al catálogo profesional.','进入专业订购目录前，先了解各类膜产品的性能、应用与真实效果。'],
    ['Clear and specialty-finish PPF for automotive and marine applications.','自動車・船舶用の透明および特殊仕上げPPF。','자동차 및 선박용 투명·특수 마감 PPF.','PPF transparente y de acabados especiales para automóviles y embarcaciones.','适用于汽车和船舶的透明及特殊表面 PPF。'],
    ['Colors, finishes, and coded product selections for automotive and marine applications.','自動車・船舶用のカラー、仕上げ、製品コードから選択。','자동차 및 선박용 색상, 마감과 제품 코드 선택.','Colores, acabados y selecciones codificadas para automóviles y embarcaciones.','为汽车和船舶提供颜色、表面效果及产品编号选择。'],
    ["Advanced heat rejection, sun protection, and UV defense for Tesla's expansive panoramic glass roof.",'テスラの大型パノラマガラスルーフ向け、高性能遮熱・日射・UV対策。','테슬라 대형 파노라마 글라스 루프를 위한 고성능 열 차단, 햇빛 및 자외선 보호.','Rechazo térmico avanzado, protección solar y UV para el amplio techo panorámico de Tesla.','专为特斯拉大面积全景玻璃车顶提供高效隔热、防晒与紫外线防护。'],
    ['Heat-rejection, privacy, safety, and security film solutions for commercial and residential glass.','商業・住宅ガラス向けの遮熱、プライバシー、安全、防犯フィルム。','상업용·주거용 유리를 위한 열 차단, 사생활 보호, 안전 및 보안 필름.','Películas de control térmico, privacidad, seguridad y protección para vidrio comercial y residencial.','适用于商业和住宅玻璃的隔热、隐私、安全与防护膜解决方案。'],
    ['Decorative and protective films for kitchens, furniture, cabinetry, and interior renovations.','キッチン、家具、収納、内装リフォーム向けの装飾・保護フィルム。','주방, 가구, 캐비닛 및 인테리어 리노베이션용 장식·보호 필름.','Películas decorativas y protectoras para cocinas, muebles, gabinetes y renovaciones interiores.','适用于厨房、家具、橱柜和室内翻新的装饰保护膜。'],
    ['Marine-focused PPF for gelcoat and painted surfaces, helping defend against scratches, UV exposure, salt spray, and dock wear.','ゲルコートや塗装面を傷、紫外線、塩害、係留時の摩耗から守る船舶用PPF。','겔코트와 도장면을 긁힘, 자외선, 염수와 부두 마모로부터 보호하는 선박용 PPF.','PPF marino para gelcoat y superficies pintadas, diseñado contra rayones, UV, salitre y desgaste en muelle.','适用于胶衣和喷漆表面的船舶 PPF，帮助抵御划痕、紫外线、盐雾及码头磨损。'],
    ['Your pricing. Your products. Your orders.','お客様価格・製品・注文を一か所で。','고객 가격, 제품과 주문을 한곳에서.','Sus precios. Sus productos. Sus pedidos.','您的价格、产品与订单，一站管理。'],
    ['Sign in to view contract pricing, create purchase orders, and track every delivery.','ログインして契約価格の確認、発注、配送追跡ができます。','로그인하여 계약 가격 확인, 구매 주문 및 배송 추적을 이용하세요.','Inicie sesión para ver precios de contrato, crear pedidos y seguir cada entrega.','登录后可查看协议价、创建采购订单并追踪每次配送。'],
    ['INVISIBLE PROTECTION · PRECISION COVERAGE · PREMIUM VEHICLES','見えない保護・精密な施工・プレミアム車両','보이지 않는 보호 · 정밀 시공 · 프리미엄 차량','PROTECCIÓN INVISIBLE · COBERTURA PRECISA · VEHÍCULOS PREMIUM','隐形保护 · 精准覆盖 · 高端车辆'],
    ['COLOR · TEXTURE · FINISH','カラー・質感・仕上げ','색상 · 질감 · 마감','COLOR · TEXTURA · ACABADO','色彩 · 纹理 · 表面效果'],
    ['TESLA ROOF FILM · PURPOSE-BUILT FOR TESLA','テスラ専用ルーフフィルム','테슬라 전용 루프 필름','PELÍCULA DE TECHO · DISEÑADA PARA TESLA','特斯拉车顶膜 · 专车专用'],
    ['HEAT REJECTION · PRIVACY · SAFETY & SECURITY','遮熱・プライバシー・安全防犯','열 차단 · 사생활 보호 · 안전 및 보안','CONTROL TÉRMICO · PRIVACIDAD · SEGURIDAD','隔热 · 隐私 · 安全防护'],
    ['COUNTERTOPS · TABLES · CABINETRY · INTERIOR SURFACES','カウンター・テーブル・収納・内装面','조리대 · 테이블 · 캐비닛 · 실내 표면','ENCIMERAS · MESAS · GABINETES · INTERIORES','台面 · 桌面 · 橱柜 · 室内表面'],
    ['MARINE PPF · GELCOAT PROTECTION · HIGH-GLOSS FINISH','船舶用PPF・ゲルコート保護・高光沢仕上げ','선박용 PPF · 겔코트 보호 · 고광택 마감','PPF MARINO · PROTECCIÓN DE GELCOAT · ALTO BRILLO','船舶 PPF · 胶衣保护 · 高亮表面'],
    ['EXPLORE PPF','PPFを見る','PPF 보기','VER PPF','了解 PPF'],
    ['EXPLORE COLOR WRAP','カーラッピングを見る','컬러 랩 보기','VER ROTULACIÓN','了解改色膜'],
    ['EXPLORE TESLA ROOF FILM','テスラルーフフィルムを見る','테슬라 루프 필름 보기','VER PELÍCULA DE TECHO TESLA','了解特斯拉车顶膜'],
    ['EXPLORE ARCHITECTURAL FILM','建築用フィルムを見る','건축용 필름 보기','VER PELÍCULA ARQUITECTÓNICA','了解建筑膜'],
    ['EXPLORE INTERIOR FILM','内装用フィルムを見る','인테리어 필름 보기','VER PELÍCULA INTERIOR','了解家居膜'],
    ['EXPLORE YACHT FILM','ヨット用フィルムを見る','요트 필름 보기','VER PELÍCULA PARA YATE','了解游艇膜'],
    ['WINDOW FILM · PPF · COLOR WRAP · ARCHITECTURAL FILM · INTERIOR FILM · YACHT FILM','ウインドウフィルム・PPF・カーラッピング・建築用・内装用・ヨット用フィルム','윈도 필름 · PPF · 컬러 랩 · 건축용 · 인테리어 · 요트 필름','PELÍCULA PARA VENTANAS · PPF · ROTULACIÓN · ARQUITECTÓNICA · INTERIOR · YATES','窗膜 · PPF · 改色膜 · 建筑膜 · 家居膜 · 游艇膜'],
    ['Professional Dealer Ordering Platform','プロ販売店発注プラットフォーム','전문 딜러 주문 플랫폼','Plataforma profesional de pedidos para distribuidores','专业经销商订购平台'],
    ['The QUaD mark belongs in truly professional installations.','QUaDのマークは真にプロフェッショナルな施工の証です。','QUaD 마크는 진정한 전문 시공의 상징입니다.','La marca QUaD distingue una instalación verdaderamente profesional.','QUaD 标识属于真正专业的施工。'],
    ['From the complex curves of professional race cars to everyday vehicles, QUaD demonstrates clarity, conformability, and protection through real products, professional tools, and finished installations.','レーシングカーの複雑な曲面から日常車まで、QUaDは実製品、専門工具、完成施工で透明性、追従性、保護性能を示します。','레이싱카의 복잡한 곡면부터 일상 차량까지 QUaD는 실제 제품, 전문 도구 및 완성 시공으로 선명도, 순응성 및 보호 성능을 보여줍니다.','Desde las curvas de un auto de carreras hasta un vehículo diario, QUaD demuestra claridad, conformabilidad y protección con productos, herramientas e instalaciones reales.','从专业赛车的复杂曲面到日常车辆，QUaD 通过真实产品、专业工具及完工案例展现清晰度、服帖性与保护力。'],
    ['MATERIAL TESTING · PRODUCTION EQUIPMENT · QUALITY CONTROL','材料試験・生産設備・品質管理','소재 시험 · 생산 설비 · 품질 관리','PRUEBAS DE MATERIAL · EQUIPO DE PRODUCCIÓN · CONTROL DE CALIDAD','材料测试 · 生产设备 · 质量控制'],
    ['Choose products by finish and application. Models, pricing, inventory, and ordering are provided by the QUaD system.','仕上げと用途から製品を選択。型番、価格、在庫、発注情報はQUaDシステムから提供されます。','표면 효과와 용도에 따라 제품을 선택하세요. 모델, 가격, 재고 및 주문 정보는 QUaD 시스템에서 제공됩니다.','Elija por acabado y aplicación. Modelos, precios, inventario y pedidos son proporcionados por el sistema QUaD.','根据表面效果和应用选择产品，型号、价格、库存和订购信息由 QUaD 系统提供。'],
    ['Enhances the original paint gloss for full-body and high-impact-area protection.','純正塗装の光沢を高め、車両全体と高衝撃部位を保護します。','순정 도장 광택을 높이고 차량 전체와 주요 충격 부위를 보호합니다.','Realza el brillo de la pintura original y protege todo el vehículo y las zonas de alto impacto.','提升原车漆光泽，保护整车及高冲击部位。'],
    ['Higher haze and lower reflection create a smooth, uniform deep-matte finish.','高い曇り度と低反射で、均一で滑らかなディープマット仕上げを実現。','높은 헤이즈와 낮은 반사로 균일하고 부드러운 딥 매트 마감을 구현합니다.','La mayor neblina y menor reflexión crean un acabado mate profundo, uniforme y suave.','更高雾度与更低反射，呈现均匀柔和的深哑光效果。'],
    ['A refined soft sheen that is subtler than gloss and more dimensional than deep matte.','グロスより控えめでディープマットより立体感のある、上品なソフトシーン。','유광보다 절제되고 딥 매트보다 입체적인 세련된 소프트 광택입니다.','Un brillo suave y refinado, más discreto que el brillante y con más dimensión que el mate profundo.','细腻柔和的光泽，比亮面低调，比深哑光更有层次。'],
    ['For bumpers, hoods, mirrors, door edges, and other high-impact areas.','バンパー、ボンネット、ミラー、ドアエッジなど高リスク部位向け。','범퍼, 보닛, 미러, 도어 엣지 등 고위험 부위용입니다.','Para defensas, capós, espejos, bordes de puerta y otras zonas de alto impacto.','适用于保险杠、引擎盖、后视镜、门边等高风险部位。'],
    ['Professional protection for yacht paint, gelcoat, and frequently touched surfaces.','ヨットの塗装、ゲルコート、高頻度接触部位を守る専門保護。','요트 도장, 젤코트 및 접촉이 잦은 표면을 위한 전문 보호입니다.','Protección profesional para pintura de yates, gelcoat y superficies de contacto frecuente.','为游艇漆面、胶衣及高频接触表面提供专业保护。'],
    ['An error occurred. Please try again or contact your sales representative.','エラーが発生しました。再試行するか担当者にご連絡ください。','오류가 발생했습니다. 다시 시도하거나 담당자에게 문의하세요.','Ocurrió un error. Inténtelo de nuevo o contacte a su representante.','发生错误，请重试或联系您的业务员。']
  ];
  const chineseEnglish = new Map(Object.entries({
    '经销商登录':'DEALER LOGIN','PPF 产品订购页':'PPF PRODUCT ORDERING','PPF 产品订购':'PPF PRODUCT ORDERING',
    '高亮透明 PPF':'HIGH-GLOSS CLEAR PPF','深哑光 PPF':'DEEP MATTE PPF','缎面 PPF':'SATIN PPF',
    '重点部位保护膜':'HIGH-IMPACT AREA PROTECTION','游艇表面保护膜':'YACHT SURFACE PROTECTION',
    '具体型号':'MODEL','请选择具体型号':'SELECT MODEL','规格':'SIZE','请选择规格':'SELECT SIZE','数量':'QTY',
    '＋ 添加另一个型号':'＋ ADD ANOTHER MODEL','选择此产品':'SELECT THIS PRODUCT','查看购物车并去结账 →':'VIEW CART & CHECK OUT →',
    '改色膜产品订购页':'COLOR WRAP ORDERING','选择改色膜颜色':'SELECT COLOR WRAP','全部':'ALL','亮光':'GLOSS','缎面':'SATIN','哑光':'MATTE',
    '搜索型号或颜色名称':'SEARCH MODEL OR COLOR','加入选色清单':'ADD TO SELECTION','下一步：核对订单 →':'NEXT: REVIEW ORDER →',
    '定制彩绘膜':'CUSTOM PRINTED WRAP','选择图片或设计文件':'SELECT IMAGE OR DESIGN FILE',
    '窗膜产品订购页':'WINDOW FILM ORDERING','选择窗膜型号':'SELECT WINDOW FILM','透光率':'VISIBLE LIGHT TRANSMISSION',
    '隔热率':'HEAT REJECTION','加入订单':'ADD TO ORDER','当前订单':'CURRENT ORDER','去结账':'CHECK OUT','继续添加产品':'CONTINUE SHOPPING',
    '收货信息':'DELIVERY INFORMATION','公司 / 门店名称':'COMPANY / SHOP NAME','收货人':'RECIPIENT','联系电话':'PHONE',
    '街道地址':'STREET ADDRESS','城市':'CITY','州':'STATE','邮编':'ZIP CODE','配送方式':'DELIVERY METHOD',
    '拉斯维加斯仓库自提':'LAS VEGAS WAREHOUSE PICKUP','洛杉矶仓库自提':'LOS ANGELES WAREHOUSE PICKUP','快递 / 物流发货':'PARCEL / FREIGHT SHIPPING',
    '付款方式':'PAYMENT METHOD','信用卡 / 借记卡':'CREDIT / DEBIT CARD','订单备注':'ORDER NOTES','付款明细':'PAYMENT SUMMARY',
    '批发价':'WHOLESALE PRICE','客户价格等级':'CUSTOMER PRICE TIER','本单专属优惠':'ORDER SAVINGS','折后商品小计':'DISCOUNTED SUBTOTAL',
    '配送费':'SHIPPING','销售税':'SALES TAX','应付总额':'TOTAL DUE','继续信用卡 / Apple Pay 付款':'CONTINUE TO CARD / APPLE PAY',
    '正在核价并检查库存…':'VERIFYING PRICE AND INVENTORY…','订单与应收':'ORDERS & RECEIVABLES','质保与往来':'WARRANTY & HISTORY',
    '← 返回产品分类':'← PRODUCT CATEGORIES'
    ,'根据表面效果和应用需求选择产品。当前为页面设计预览，型号、价格、库存和下单功能尚未连接。':'Choose products by finish and application. Models, pricing, inventory, and ordering are provided by the QUaD system.'
    ,'突出原车漆光泽，适用于整车及重点部位的日常防护。':'Enhances the original paint gloss for full-body and high-impact-area protection.'
    ,'雾度更高、反光更少，呈现均匀柔和、更加纯粹的深哑光效果。':'Higher haze and lower reflection create a smooth, uniform deep-matte finish.'
    ,'保留细腻的柔和光泽，比亮面低调、比深哑光更有层次和质感。':'A refined soft sheen that is subtler than gloss and more dimensional than deep matte.'
    ,'适用于前保险杠、引擎盖、后视镜、门边及其他高风险区域。':'For bumpers, hoods, mirrors, door edges, and other high-impact areas.'
    ,'针对游艇高光漆面、胶衣及高频接触区域的专业保护方案。':'Professional protection for yacht paint, gelcoat, and frequently touched surfaces.'
    ,'透明系列':'CLEAR SERIES','高雾度系列':'DEEP MATTE SERIES','轻雾度系列':'SATIN SERIES','专项保护系列':'SPECIALTY PROTECTION','船艇应用系列':'MARINE SERIES'
    ,'型号由 QUaD 库存系统提供':'MODELS PROVIDED BY QUAD INVENTORY','1.2 米 × 30 米':'1.2 m × 30 m','1.52 米 × 15 米':'1.52 m × 15 m'
    ,'20 英寸 × 100 英尺（约 0.51 × 30.5 米）':'20 in × 100 ft (approx. 0.51 × 30.5 m)','36 英寸 × 100 英尺（约 0.91 × 30.5 米）':'36 in × 100 ft (approx. 0.91 × 30.5 m)'
    ,'40 英寸 × 100 英尺（约 1.02 × 30.5 米）':'40 in × 100 ft (approx. 1.02 × 30.5 m)','60 英寸 × 100 英尺（约 1.52 × 30.5 米）':'60 in × 100 ft (approx. 1.52 × 30.5 m)'
    ,'当前为页面设计预览，不查询实时库存、不扣减库存，也不会生成正式订单。':'This preview does not check or deduct live inventory and does not create a final order.'
    ,'快速选货与下单':'QUICK SELECT & ORDER','请先选择上方型号':'SELECT A MODEL ABOVE','型号参数将自动带入这里':'MODEL DETAILS APPEAR AUTOMATICALLY','卷材规格':'ROLL SIZE'
    ,'汽车窗膜产品订购页':'AUTOMOTIVE WINDOW FILM ORDERING','03 · 汽车隔热膜':'03 · AUTOMOTIVE WINDOW FILM','高清低雾度':'HIGH CLARITY · LOW HAZE','高效隔热':'HIGH HEAT REJECTION','收缩施工友好':'INSTALLER-FRIENDLY SHRINK','多种透光率':'MULTIPLE VLT OPTIONS'
    ,'顶级双银':'PREMIUM DUAL-SILVER','SP 混合系列':'SP HYBRID SERIES','Nano 陶瓷':'NANO CERAMIC','P 经济系列':'P VALUE SERIES','TAI 天窗专用':'TAI ROOF SERIES'
    ,'按性能等级、透光率和应用位置选择产品。QUaD 窗膜重点突出高清、高透、低雾度、强隔热和良好的热收缩施工表现。':'Choose by performance, VLT, and application. QUaD window film delivers clarity, low haze, strong heat rejection, and installer-friendly shrinking.'
    ,'点击色卡查看大色样和订货选项。当前色号为页面演示，正式色号将由 QUaD 库存系统同步。':'Tap a swatch to view the full color and ordering options. Live color codes are synchronized from QUaD inventory.'
    ,'新颜色 / 色卡暂未收录':'NEW COLOR / SWATCH PENDING','输入现有库存型号':'ENTER AN EXISTING INVENTORY MODEL','库存型号':'INVENTORY MODEL','颜色名称':'COLOR NAME'
    ,'＋ 加入选色清单':'＋ ADD TO COLOR ORDER','本次已选':'CURRENT SELECTION','选色清单':'COLOR ORDER','＋ 继续添加其他颜色':'＋ ADD ANOTHER COLOR'
    ,'定制服务':'CUSTOM SERVICE','1. 选择现有图案':'1. CHOOSE A QUAD DESIGN','2. 或上传自己的图片':'2. OR UPLOAD YOUR IMAGE','3. 填写车辆资料':'3. VEHICLE DETAILS','年份':'YEAR','品牌':'MAKE','车型':'MODEL','设计要求':'DESIGN REQUEST'
    ,'灰红渐变':'GRAY–RED GRADIENT','赛车拉花':'RACING GRAPHICS','几何切面':'GEOMETRIC FACETS','自定义图案':'CUSTOM DESIGN'
    ,'订单商品':'ORDER ITEMS','核对订单并付款':'REVIEW & PAY','统一结账':'CHECKOUT','标准商业配送':'COMMERCIAL SHIPPING','提交发货订单（运费待确认）':'SUBMIT SHIPPING ORDER (FREIGHT PENDING)'
  }));
  const indexes = { en:0, ja:1, ko:2, 'es-MX':3, 'zh-CN':4 };
  const dictionaries = Object.fromEntries(supported.map(l => [l, new Map()]));
  rows.forEach(row => {
    const english = chineseEnglish.get(row[0]) || row[0];
    const targets = { en:english, ja:row[1], ko:row[2], 'es-MX':row[3], 'zh-CN':row[4] };
    [...new Set([...row, english])].forEach(source => supported.forEach(l => {
      if (source) dictionaries[l].set(normalize(source), targets[l]);
    }));
  });
  for (const [chinese, english] of chineseEnglish) {
    const row = rows.find(candidate => normalize(candidate[0]) === normalize(english));
    if (!row) continue;
    supported.forEach(language => dictionaries[language].set(normalize(chinese), row[indexes[language]]));
  }

  function normalize(value) { return String(value || '').replace(/\s+/g,' ').trim(); }
  function strictFallback(value) {
    const text = normalize(value);
    if (!text) return value;
    if (locale !== 'zh-CN' && /[\u3400-\u9fff]/.test(text)) return dictionaries[locale].get(normalize('An error occurred. Please try again or contact your sales representative.'));
    return value;
  }
  function translateValue(value) {
    const text = normalize(value);
    if (!text) return value;
    if (locale === 'en') {
      const exactEnglish = chineseEnglish.get(text);
      if (exactEnglish) return String(value).replace(text, exactEnglish);
      let translatedEnglish = String(value);
      for (const [source, replacement] of chineseEnglish) {
        if (source.length >= 4 && translatedEnglish.includes(source)) translatedEnglish = translatedEnglish.split(source).join(replacement);
      }
      if (translatedEnglish !== String(value)) return translatedEnglish;
    }
    const direct = dictionaries[locale].get(text);
    if (direct) return String(value).replace(text, direct);
    let translated = String(value);
    for (const row of rows) {
      for (const source of row) {
        if (!source || source.length < 4 || !translated.includes(source)) continue;
        const replacement = locale === 'en' ? (chineseEnglish.get(row[0]) || row[0]) : row[indexes[locale]];
        translated = translated.split(source).join(replacement);
      }
    }
    if (translated !== String(value)) return translated;
    return strictFallback(value);
  }
  function translateRoot(root=document.body) {
    if (!root || root.closest?.('.quad-language-picker')) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => { if (!node.parentElement?.closest('script,style,.quad-language-picker')) node.nodeValue=translateValue(node.nodeValue); });
    root.querySelectorAll?.('[placeholder],[title],[aria-label]').forEach(el => ['placeholder','title','aria-label'].forEach(a => { if(el.hasAttribute(a)) el.setAttribute(a,translateValue(el.getAttribute(a))); }));
  }
  function picker() {
    const label=document.createElement('label'); label.className='quad-language-picker';
    const caption=document.createElement('span'); caption.textContent=rows[0][indexes[locale]];
    const select=document.createElement('select'); select.setAttribute('aria-label',caption.textContent);
    supported.forEach(code=>{const option=document.createElement('option');option.value=code;option.textContent=localeNames[locale][code];option.selected=code===locale;select.append(option);});
    select.addEventListener('change',()=>setLocale(select.value)); label.append(caption,select); return label;
  }
  function injectPickers() {
    const targets=[...document.querySelectorAll('.brand-header,.order-center-header,.customer-account-center>header')];
    targets.forEach(target=>{if(target.querySelector('.quad-language-picker'))return; const p=picker(); const dealer=target.querySelector('.dealer-button,.order-login-button'); dealer ? dealer.before(p) : target.append(p);});
    const login=document.querySelector('.customer-login'); if(login && !login.querySelector(':scope>.quad-language-picker')) login.prepend(picker());
  }
  function setLocale(next) {
    if(!supported.includes(next)) return;
    locale=next; localStorage.setItem(STORE,locale); document.documentElement.lang=locale;
    document.querySelectorAll('.quad-language-picker').forEach(p=>p.remove());
    location.reload();
  }
  document.documentElement.lang=locale;
  injectPickers(); translateRoot();
  let queued=false;
  new MutationObserver(mutations=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;injectPickers();mutations.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1)translateRoot(n);else if(n.nodeType===3&&n.parentElement)translateRoot(n.parentElement);}));});}).observe(document.body,{childList:true,subtree:true});
  window.QuadI18n={ get locale(){return locale;}, setLocale, t:translateValue, translateRoot, supported:[...supported] };
})();
