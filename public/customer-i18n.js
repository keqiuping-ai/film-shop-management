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
    ['ADVANCED FILM TECHNOLOGY','先進フィルム技術','첨단 필름 기술','TECNOLOGÍA AVANZADA DE PELÍCULAS','先进膜技术'],
    ['DEALER LOGIN','販売店ログイン','딜러 로그인','INICIAR SESIÓN','经销商登录'],
    ['CURRENT CUSTOMER','現在の顧客','현재 로그인 고객','CLIENTE ACTUAL','当前登录客户'],
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
    ['CHOOSE FILE','ファイルを選択','파일 선택','SELECCIONAR ARCHIVO','选择文件'],
    ['NO FILE SELECTED','ファイル未選択','선택된 파일 없음','NINGÚN ARCHIVO SELECCIONADO','未选择文件'],
    ['FILES SELECTED','個のファイルを選択','개 파일 선택됨','ARCHIVOS SELECCIONADOS','个文件已选择'],
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
    ['SEARCH, SELECT & ORDER','検索・選択・注文','검색·선택·주문','BUSCAR, ELEGIR Y PEDIR','搜索、选色与下单'],
    ['Enter a model to search or tap a swatch below; confirm the size and quantity, then add it directly to the order.','型番を入力して検索するか下の色見本を選び、サイズと数量を確認して注文に追加してください。','모델을 검색하거나 아래 색상 견본을 선택한 뒤 규격과 수량을 확인하여 주문에 추가하세요.','Busque un modelo o toque una muestra; confirme tamaño y cantidad y agréguelo al pedido.','输入型号搜索，或点击下方色卡；确认规格和数量后直接加入订单。'],
    ['Live QUaD inventory will be checked here before the order is reviewed.','注文確認前にQUaDのリアルタイム在庫をここで確認します。','주문 검토 전에 여기에서 QUaD 실시간 재고를 확인합니다.','Aquí se verificará el inventario de QUaD antes de revisar el pedido.','正式接入后将在这里查询 QUaD 实时库存并继续核对订单。'],
    ['1.52 m × 18 m','1.52 m × 18 m','1.52 m × 18 m','1.52 m × 18 m','1.52 米 × 18 米'],
    ['Example: TPUQD106','例：TPUQD106','예: TPUQD106','Ejemplo: TPUQD106','例如：TPUQD106'],
    ['Enter a color name','色名を入力','색상 이름 입력','Ingrese el nombre del color','请输入颜色名称'],
    ['Please enter an inventory model and color name.','在庫型番と色名を入力してください。','재고 모델과 색상 이름을 입력하세요.','Ingrese el modelo de inventario y el nombre del color.','请填写库存型号和颜色名称。'],
    ['Custom Service','カスタムサービス','맞춤 서비스','Servicio personalizado','定制服务'],
    ['Choose an existing QUaD design or upload your own reference image. After you submit the vehicle details, our design team will confirm the artwork, dimensions, and production plan.','既存のQUaDデザインを選ぶか参考画像をアップロードしてください。車両情報の送信後、デザインチームが図柄、寸法、制作方法を確認します。','기존 QUaD 디자인을 선택하거나 참고 이미지를 업로드하세요. 차량 정보를 제출하면 디자인 팀이 그래픽, 크기 및 제작 방안을 확인합니다.','Elija un diseño QUaD o cargue su imagen de referencia. Al enviar los datos del vehículo, el equipo confirmará arte, dimensiones y producción.','选择 QUaD 现有图案，或上传自己的参考图片。提交车辆资料后，由设计团队确认画面、尺寸和制作方案。'],
    ['Files supported: photos, renderings, or design references; only the file name is shown for now.','写真、完成イメージ、デザイン資料に対応。現在はファイル名のみ表示します。','사진, 렌더링 또는 디자인 참고 파일을 지원하며 현재는 파일 이름만 표시됩니다.','Se admiten fotos, renders o referencias de diseño; por ahora solo se muestra el nombre del archivo.','支持照片、效果图或设计参考；当前仅显示文件名。'],
    ['No file selected','ファイル未選択','선택된 파일 없음','Ningún archivo seleccionado','尚未选择文件'],
    ['Example: 2025','例：2025','예: 2025','Ejemplo: 2025','例如：2025'],
    ['Example: Tesla','例：Tesla','예: Tesla','Ejemplo: Tesla','例如：Tesla'],
    ['Example: Model Y','例：Model Y','예: Model Y','Ejemplo: Model Y','例如：Model Y'],
    ['Describe colors, gradient direction, graphic placement, text, or other requirements','色、グラデーション方向、図柄の位置、文字などの要望を記入してください','색상, 그라데이션 방향, 그래픽 위치, 문구 또는 기타 요구 사항을 입력하세요','Describa colores, dirección del degradado, ubicación, texto u otros requisitos','请描述颜色、渐变方向、图案位置、文字或其他要求'],
    ['SUBMIT CUSTOM DESIGN (PREVIEW)','カスタム案を送信（プレビュー）','맞춤 디자인 제출(미리보기)','ENVIAR DISEÑO PERSONALIZADO (VISTA PREVIA)','提交定制方案（页面预览）'],
    ['This will create a design request after launch; it will not deduct inventory or charge automatically.','正式運用後はデザイン依頼を作成します。在庫の引当や自動請求は行いません。','정식 운영 후 디자인 요청이 생성되며 재고 차감이나 자동 결제는 하지 않습니다.','En producción se creará una solicitud de diseño; no descontará inventario ni cobrará automáticamente.','正式接入后，这里会生成设计需求单，不会直接扣库存或自动收费。'],
    ['Custom wrap request preview','カスタムラップ依頼プレビュー','맞춤 랩 요청 미리보기','Vista previa de solicitud personalizada','定制彩绘膜需求预览'],
    ['Design','デザイン','디자인','Diseño','方案'],
    ['This preview does not submit production data.','このプレビューは正式データを送信しません。','이 미리보기는 정식 데이터를 제출하지 않습니다.','Esta vista previa no envía datos de producción.','当前不会提交正式数据。'],
    ['FLAME GOLD','フレイムゴールド','플레임 골드','ORO EN LLAMAS','烈焰流金'],
    ['BLUE CRYSTAL CYBER','ブルークリスタル・サイバー','블루 크리스털 사이버','CRISTAL AZUL CIBERNÉTICO','蓝晶赛博'],
    ['CORAL SEA BREEZE','コーラル・シーブリーズ','코랄 시 브리즈','BRISA MARINA CORAL','珊瑚海风'],
    ['EMERALD TOPOGRAPHY','エメラルド地形図','에메랄드 지형','TOPOGRAFÍA ESMERALDA','翡翠地形'],
    ['DEEP-SEA CIRCUIT','ディープシー回路','딥시 서킷','CIRCUITO DE MAR PROFUNDO','深海电路'],
    ['COPPER VELOCITY','カッパー・ベロシティ','코퍼 벨로시티','VELOCIDAD COBRE','铜影锋芒'],
    ['OCEAN SUN','オーシャンサン','오션 선','SOL DEL OCÉANO','海洋日轮'],
    ['CRIMSON BRUSH','クリムゾンブラシ','크림슨 브러시','PINCEL CARMESÍ','赤红墨痕'],
    ['PURPLE GALAXY','パープルギャラクシー','퍼플 갤럭시','GALAXIA PÚRPURA','紫境星云'],
    ['DESERT MOUNTAINS','デザートマウンテン','데저트 마운틴','MONTAÑAS DEL DESIERTO','沙漠群峰'],
    ['AURORA COLOR','オーロラカラー','오로라 컬러','COLOR AURORA','极光幻彩'],
    ['PINK SHADOW','ピンクシャドウ','핑크 섀도','SOMBRA ROSA','粉黑疾影'],
    ['INK & GOLD','インク＆ゴールド','잉크 앤 골드','TINTA Y ORO','水墨鎏金'],
    ['LIME ARMOR','ライムアーマー','라임 아머','ARMADURA LIMA','荧光战甲'],
    ['PURPLE AURORA','パープルオーロラ','퍼플 오로라','AURORA PÚRPURA','紫蓝极光'],
    ['YELLOW TRACK','イエロートラック','옐로 트랙','PISTA AMARILLA','黄黑赛道'],
    ['POP ART','ポップアート','팝 아트','ARTE POP','欢乐涂鸦'],
    ['BURGUNDY FLOW','バーガンディフロー','버건디 플로','FLUJO BURDEOS','勃艮第流光'],
    ['GLACIER CAMO','グレイシャーカモ','글레이셔 카모','CAMUFLAJE GLACIAR','冰川迷彩'],
    ['CLASSIC GREEN RACING','クラシックグリーン・レーシング','클래식 그린 레이싱','VERDE CLÁSICO DE CARRERA','经典绿赛'],
    ['SELECT ROLL SIZE','ロールサイズを選択','롤 규격 선택','SELECCIONE EL TAMAÑO DEL ROLLO','选择卷材规格'],
    ['Please select a window-film model first.','先にウインドウフィルムの型番を選択してください。','먼저 윈도 필름 모델을 선택하세요.','Seleccione primero un modelo de película para ventanas.','请先选择一个窗膜型号。'],
    ['Please select a roll size.','ロールサイズを選択してください。','롤 규격을 선택하세요.','Seleccione un tamaño de rollo.','请选择卷材规格。'],
    ['This model and roll size are not currently available. Please select an available combination.','この型番とロールサイズは現在購入できません。購入可能な組み合わせを選択してください。','이 모델과 롤 규격은 현재 구매할 수 없습니다. 구매 가능한 조합을 선택하세요.','Este modelo y tamaño de rollo no están disponibles. Seleccione una combinación disponible.','当前型号与卷材规格暂不可购买，请选择可售组合。'],
    ['This window-film model and roll size are no longer available. Please return to the product page and select again.','このウインドウフィルムの型番とロールサイズは購入できません。商品ページに戻って選び直してください。','이 윈도 필름 모델과 롤 규격은 더 이상 구매할 수 없습니다. 제품 페이지로 돌아가 다시 선택하세요.','Este modelo y tamaño de película ya no están disponibles. Regrese a la página del producto y seleccione de nuevo.','该窗膜型号与卷材规格已不可售，请返回产品页重新选择。'],
    ['This model and size are not currently available. Please select a product from the live catalog.','この型番とサイズは現在購入できません。最新カタログから商品を選択してください。','이 모델과 규격은 현재 구매할 수 없습니다. 실시간 카탈로그에서 제품을 선택하세요.','Este modelo y tamaño no están disponibles. Seleccione un producto del catálogo actual.','当前型号与规格暂不可购买，请从实时产品目录中选择。'],
    ['A selected model and size are no longer available. Please return to the product page and select again.','選択した型番とサイズは購入できません。商品ページに戻って選び直してください。','선택한 모델과 규격은 더 이상 구매할 수 없습니다. 제품 페이지로 돌아가 다시 선택하세요.','Un modelo y tamaño seleccionados ya no están disponibles. Regrese a la página del producto y seleccione de nuevo.','所选型号与规格已不可售，请返回产品页重新选择。'],
    ['Automotive Window Film','自動車ウインドウフィルム','자동차 윈도 필름','Película automotriz para ventanas','汽车窗膜'],
    ['PPF Paint Protection Film','PPFペイントプロテクションフィルム','PPF 도장 보호 필름','Película de protección de pintura PPF','PPF 漆面保护膜'],
    ['Please select a model.','型番を選択してください。','모델을 선택하세요.','Seleccione un modelo.','请选择具体型号。'],
    ['Please select a size.','サイズを選択してください。','규격을 선택하세요.','Seleccione un tamaño.','请选择规格。'],
    ['01 · PREMIUM SERIES','01・プレミアムシリーズ','01 · 프리미엄 시리즈','01 · SERIE PREMIUM','01 · 顶级系列'],
    ['02 · HIGH-PERFORMANCE SERIES','02・高性能シリーズ','02 · 고성능 시리즈','02 · SERIE DE ALTO RENDIMIENTO','02 · 高性能系列'],
    ['03 · CLASSIC SERIES','03・クラシックシリーズ','03 · 클래식 시리즈','03 · SERIE CLÁSICA','03 · 经典系列'],
    ['04 · VALUE SERIES','04・バリューシリーズ','04 · 실속형 시리즈','04 · SERIE ECONÓMICA','04 · 经济型系列'],
    ['05 · PANORAMIC-ROOF SERIES','05・パノラマルーフシリーズ','05 · 파노라마 루프 시리즈','05 · SERIE PARA TECHO PANORÁMICO','05 · 车顶专用系列'],
    ['Premium Magnetron Sputtered Series','プレミアム・マグネトロンスパッタシリーズ','프리미엄 마그네트론 스퍼터 시리즈','Serie premium de pulverización catódica','Premium 磁控溅射系列'],
    ['Dual-silver reflective heat rejection','デュアルシルバー反射遮熱技術','듀얼 실버 반사 열 차단 기술','Rechazo térmico reflectivo de doble plata','双银反射隔热技术'],
    ['A dual-silver magnetron-sputtered structure rejects heat by reflection, delivering high light transmission, clarity, low haze, and strong heat rejection.','デュアルシルバーのマグネトロンスパッタ構造が反射で熱を遮り、高透過・高透明・低ヘイズ・高遮熱を実現します。','듀얼 실버 마그네트론 스퍼터 구조가 열을 반사해 높은 투과율, 선명도, 낮은 헤이즈와 강력한 열 차단을 제공합니다.','La estructura magnetrón de doble plata rechaza el calor por reflexión, con alta transmisión, claridad, baja neblina y gran rechazo térmico.','双层银磁控溅射结构，以反射方式阻隔热量。主打高透、高清、低雾度与强隔热。'],
    ['Sputtered Hybrid Series','スパッタ・ハイブリッドシリーズ','스퍼터 하이브리드 시리즈','Serie híbrida de pulverización','磁控溅射混合系列'],
    ['Single-silver reflection + nano heat absorption','シングルシルバー反射＋ナノ吸熱','싱글 실버 반사 + 나노 흡열','Reflexión de plata simple + absorción nano','单银反射＋Nano 吸热'],
    ['Single-silver sputtering and nano ceramic technology combine clear visibility, heat rejection, and installer-friendly shrinking.','シングルシルバースパッタとナノセラミックを組み合わせ、視認性、遮熱、収縮施工性を両立します。','싱글 실버 스퍼터와 나노 세라믹을 결합해 선명한 시야, 열 차단 및 수축 시공성을 제공합니다.','La plata simple y la nanocerámica combinan visibilidad clara, rechazo térmico y facilidad de termoencogido.','单银磁控溅射与 Nano 陶瓷结合，兼顾清晰视野、隔热表现和施工收缩性能。'],
    ['Nano Ceramic Series','ナノセラミックシリーズ','나노 세라믹 시리즈','Serie nanocerámica','Nano 陶瓷系列'],
    ['Nano ceramic heat-absorption technology','ナノセラミック吸熱技術','나노 세라믹 흡열 기술','Tecnología nanocerámica de absorción térmica','Nano 陶瓷吸热技术'],
    ['Signal-safe nano ceramic technology provides options from high-transmission windshields to dark privacy shades.','電波干渉のないナノセラミック技術で、高透過フロント用から濃色プライバシー用まで揃えています。','신호 간섭 없는 나노 세라믹 기술로 고투과 전면용부터 짙은 프라이버시용까지 제공합니다.','La tecnología nanocerámica sin interferencia ofrece opciones desde parabrisas de alta transmisión hasta tonos oscuros de privacidad.','采用吸热型 Nano 陶瓷技术，无信号干扰；提供从高透前挡到深色隐私的多种透光率。'],
    ['P Basic Heat-Rejection Series','P ベーシック遮熱シリーズ','P 기본 열 차단 시리즈','Serie básica P de rechazo térmico','P 基础隔热系列'],
    ['Value-focused entry window film','高コストパフォーマンス入門フィルム','가성비 입문용 윈도 필름','Película básica de gran valor','高性价比入门窗膜'],
    ['A value-focused series for budget-sensitive projects, with popular medium and dark VLT choices and 99% UV rejection.','価格重視の案件向けに、中濃色と濃色の一般的な透過率を揃え、UVを99%カットします。','가격 민감형 프로젝트를 위한 중간·짙은 투과율 옵션과 99% 자외선 차단을 제공합니다.','Serie económica con tonos medios y oscuros comunes y rechazo UV del 99%.','面向价格敏感型项目的基础窗膜系列，提供常用的深色与中深色透光选择，紫外线阻隔率 99%。'],
    ['TAI Panoramic-Roof Film','TAIパノラマルーフ専用フィルム','TAI 파노라마 루프 전용 필름','Película TAI para techo panorámico','TAI 天窗专用膜'],
    ['High-performance panoramic-roof heat rejection','パノラマルーフ高性能遮熱','파노라마 루프 고성능 열 차단','Alto rechazo térmico para techo panorámico','全景天窗高效隔热'],
    ['Designed for sunroofs and panoramic roofs, balancing suitable light transmission with strong heat rejection and 99% UV rejection.','サンルーフとパノラマルーフ専用。適度な透過率と高い遮熱性能、99%のUVカットを両立します。','선루프와 파노라마 루프용으로 적절한 투과율, 강력한 열 차단과 99% 자외선 차단을 제공합니다.','Diseñada para quemacocos y techos panorámicos, combina transmisión adecuada, alto rechazo térmico y 99% de rechazo UV.','专为汽车天窗与全景车顶设计，在保留合适透光率的同时提供高隔热表现，紫外线阻隔率 99%。'],
    ['VLT','可視光透過率','가시광선 투과율','VLT','透光率'],
    ['HEAT REJECTION','遮熱','열 차단','RECHAZO TÉRMICO','隔热'],
    ['PPF ORDER LIST','PPF注文リスト','PPF 주문 목록','LISTA DE PEDIDO PPF','PPF 订购清单'],
    ['WINDOW FILM ORDER LIST','ウインドウフィルム注文リスト','윈도 필름 주문 목록','LISTA DE PELÍCULA PARA VENTANAS','窗膜订购清单'],
    ['This preview does not check or deduct live inventory and does not create a final order.','このプレビューはリアルタイム在庫の照会・引当を行わず、正式注文も作成しません。','이 미리보기는 실시간 재고를 조회하거나 차감하지 않으며 정식 주문을 생성하지 않습니다.','Esta vista previa no consulta ni descuenta inventario y no crea un pedido final.','当前为页面设计预览，不查询实时库存、不扣减库存，也不会生成正式订单。'],
    ['Tap a swatch to view the full color and ordering options. Live color codes are synchronized from QUaD inventory.','色見本を選ぶと大きな色と注文項目を確認できます。正式な色番号はQUaD在庫から同期されます。','색상 견본을 눌러 큰 색상과 주문 옵션을 확인하세요. 실제 색상 코드는 QUaD 재고와 동기화됩니다.','Toque una muestra para ver el color y las opciones de pedido. Los códigos reales se sincronizan con el inventario QUaD.','点击色卡查看大色样和订货选项。当前色号为页面演示，正式色号将由 QUaD 库存系统同步。'],
    ['QUICK SELECT & ORDER','クイック選択・注文','빠른 선택 및 주문','SELECCIÓN Y PEDIDO RÁPIDO','快速选货与下单'],
    ['INVENTORY MODEL','在庫型番','재고 모델','MODELO DE INVENTARIO','库存型号'],
    ['COLOR NAME','色名','색상 이름','NOMBRE DEL COLOR','颜色名称'],
    ['ORDER LIST','注文リスト','주문 목록','LISTA DE PEDIDO','订购清单'],
    ['Pearl White','パールホワイト','펄 화이트','Blanco perla','珍珠白'],
    ['Obsidian Black','オブシディアンブラック','옵시디언 블랙','Negro obsidiana','曜石黑'],
    ['Racing Red','レーシングレッド','레이싱 레드','Rojo carrera','赛道红'],
    ['Miami Blue','マイアミブルー','마이애미 블루','Azul Miami','迈阿密蓝'],
    ['Emerald Green','エメラルドグリーン','에메랄드 그린','Verde esmeralda','翡翠绿'],
    ['Sunset Orange','サンセットオレンジ','선셋 오렌지','Naranja atardecer','日落橙'],
    ['Nardo Gray','ナルドグレー','나르도 그레이','Gris Nardo','战斗灰'],
    ['Glacier Silver','グレイシャーシルバー','글레이셔 실버','Plata glaciar','冰川银'],
    ['Midnight Blue','ミッドナイトブルー','미드나이트 블루','Azul medianoche','午夜蓝'],
    ['Desert Gold','デザートゴールド','데저트 골드','Oro desierto','沙漠金'],
    ['Military Green','ミリタリーグリーン','밀리터리 그린','Verde militar','军绿色'],
    ['Lavender Purple','ラベンダーパープル','라벤더 퍼플','Morado lavanda','薰衣草紫'],
    ['Sakura Pink','サクラピンク','사쿠라 핑크','Rosa sakura','樱花粉'],
    ['Electric Yellow','エレクトリックイエロー','일렉트릭 옐로','Amarillo eléctrico','电光黄'],
    ['Champagne Gold','シャンパンゴールド','샴페인 골드','Oro champaña','香槟金'],
    ['1. CHOOSE A QUAD DESIGN','1. QUaDデザインを選択','1. QUaD 디자인 선택','1. ELIJA UN DISEÑO QUAD','1. 选择现有图案'],
    ['CUSTOM DESIGN','カスタムデザイン','맞춤 디자인','DISEÑO PERSONALIZADO','自定义图案'],
    ['2. OR UPLOAD YOUR IMAGE','2. または画像をアップロード','2. 또는 이미지 업로드','2. O CARGUE SU IMAGEN','2. 或上传自己的图片'],
    ['3. VEHICLE DETAILS','3. 車両情報','3. 차량 정보','3. DATOS DEL VEHÍCULO','3. 填写车辆资料'],
    ['YEAR','年式','연식','AÑO','年份'],
    ['MAKE','メーカー','브랜드','MARCA','品牌'],
    ['MODEL','車種','모델','MODELO','车型'],
    ['DESIGN REQUEST','デザイン要望','디자인 요청','SOLICITUD DE DISEÑO','设计要求'],
    ['NEXT: REVIEW ORDER','次へ：注文確認','다음: 주문 확인','SIGUIENTE: REVISAR PEDIDO','下一步：核对订单'],
    ['CONTINUE REVIEWING THIS PAGE','このページの確認を続ける','이 페이지 계속 확인','SEGUIR REVISANDO ESTA PÁGINA','继续检查本页'],
    ['HIGH CLARITY · LOW HAZE','高透明・低ヘイズ','고선명 · 저헤이즈','ALTA CLARIDAD · BAJA NEBLINA','高清低雾度'],
    ['INSTALLER-FRIENDLY SHRINK','収縮施工が容易','수축 시공 용이','TERMOENCOGIDO FÁCIL','收缩施工友好'],
    ['PREMIUM DUAL-SILVER','プレミアム・デュアルシルバー','프리미엄 듀얼 실버','DOBLE PLATA PREMIUM','顶级双银'],
    ['SP HYBRID SERIES','SPハイブリッドシリーズ','SP 하이브리드 시리즈','SERIE HÍBRIDA SP','SP 混合系列'],
    ['NANO CERAMIC','ナノセラミック','나노 세라믹','NANOCERÁMICA','Nano 陶瓷'],
    ['P VALUE SERIES','Pバリューシリーズ','P 실속형 시리즈','SERIE ECONÓMICA P','P 经济系列'],
    ['TAI ROOF SERIES','TAIルーフシリーズ','TAI 루프 시리즈','SERIE DE TECHO TAI','TAI 天窗专用'],
    ['SELECT A MODEL ABOVE','上の型番を選択','위에서 모델을 선택하세요','SELECCIONE UN MODELO ARRIBA','请先选择上方型号'],
    ['MODEL DETAILS APPEAR AUTOMATICALLY','型番情報が自動表示されます','모델 정보가 자동으로 표시됩니다','LOS DATOS DEL MODELO APARECEN AUTOMÁTICAMENTE','型号参数将自动带入这里'],
    ['20 in × 100 ft (approx. 0.51 × 30.5 m)','20インチ × 100フィート（約0.51 × 30.5 m）','20인치 × 100피트(약 0.51 × 30.5m)','20 pulg × 100 pies (aprox. 0.51 × 30.5 m)','20 英寸 × 100 英尺（约 0.51 × 30.5 米）'],
    ['36 in × 100 ft (approx. 0.91 × 30.5 m)','36インチ × 100フィート（約0.91 × 30.5 m）','36인치 × 100피트(약 0.91 × 30.5m)','36 pulg × 100 pies (aprox. 0.91 × 30.5 m)','36 英寸 × 100 英尺（约 0.91 × 30.5 米）'],
    ['40 in × 100 ft (approx. 1.02 × 30.5 m)','40インチ × 100フィート（約1.02 × 30.5 m）','40인치 × 100피트(약 1.02 × 30.5m)','40 pulg × 100 pies (aprox. 1.02 × 30.5 m)','40 英寸 × 100 英尺（约 1.02 × 30.5 米）'],
    ['60 in × 100 ft (approx. 1.52 × 30.5 m)','60インチ × 100フィート（約1.52 × 30.5 m）','60인치 × 100피트(약 1.52 × 30.5m)','60 pulg × 100 pies (aprox. 1.52 × 30.5 m)','60 英寸 × 100 英尺（约 1.52 × 30.5 米）'],
    ['NEXT: UNIFIED CHECKOUT','次へ：統合会計','다음: 통합 결제','SIGUIENTE: PAGO UNIFICADO','下一步：统一结账'],
    ['The final cart combines window film, PPF, and color wrap, then verifies inventory, address, shipping, tax, and payment together.','最終カートではウインドウフィルム、PPF、ラップをまとめ、在庫、住所、送料、税、支払いを一括確認します。','최종 장바구니에서 윈도 필름, PPF, 컬러 랩을 합쳐 재고, 주소, 배송비, 세금 및 결제를 함께 확인합니다.','El carrito final combina película para ventanas, PPF y vinilo, y verifica inventario, dirección, envío, impuestos y pago.','正式版本会把窗膜、PPF、改色膜等产品合并到同一个购物车，再统一核对库存、地址、运费、税费和付款信息。'],
    ['NEXT: CHECKOUT','次へ：会計','다음: 결제','SIGUIENTE: PAGAR','下一步：去结账'],
    ['AUTOMOTIVE WINDOW FILM ORDERING','自動車ウインドウフィルム発注','자동차 윈도 필름 주문','PEDIDO DE PELÍCULA AUTOMOTRIZ','汽车窗膜产品订购页'],
    ['03 · AUTOMOTIVE WINDOW FILM','03・自動車ウインドウフィルム','03 · 자동차 윈도 필름','03 · PELÍCULA AUTOMOTRIZ','03 · 汽车隔热膜'],
    ['Choose by performance, VLT, and application. QUaD window film delivers clarity, low haze, strong heat rejection, and installer-friendly shrinking.','性能、可視光透過率、施工位置から選択。QUaDウインドウフィルムは高透明、低ヘイズ、高遮熱、優れた収縮施工性を備えています。','성능, 가시광선 투과율 및 적용 위치에 따라 선택하세요. QUaD 윈도 필름은 선명도, 낮은 헤이즈, 강력한 열 차단 및 우수한 수축 시공성을 제공합니다.','Elija por rendimiento, VLT y aplicación. La película QUaD ofrece claridad, baja neblina, alto rechazo térmico y fácil termoencogido.','按性能等级、透光率和应用位置选择产品。QUaD 窗膜重点突出高清、高透、低雾度、强隔热和良好的热收缩施工表现。'],
    ['HIGH HEAT REJECTION','高遮熱','강력한 열 차단','ALTO RECHAZO TÉRMICO','高效隔热'],
    ['MULTIPLE VLT OPTIONS','多彩な透過率','다양한 투과율','VARIAS OPCIONES DE VLT','多种透光率'],
    ['ROLL SIZE','ロールサイズ','롤 규격','TAMAÑO DEL ROLLO','卷材规格'],
    ['MATTE BLACK','マットブラック','매트 블랙','NEGRO MATE','哑光黑'],
    ['＋ SELECT IMAGE OR DESIGN FILE','＋ 画像またはデザインファイルを選択','＋ 이미지 또는 디자인 파일 선택','＋ SELECCIONAR IMAGEN O ARCHIVO DE DISEÑO','＋ 选择图片或设计文件'],
    ['At submission, every color code, size, and quantity will be checked against sellable inventory.','送信時に各色番号、サイズ、数量を販売可能在庫と照合します。','제출 시 각 색상 코드, 규격 및 수량을 판매 가능한 재고와 확인합니다.','Al enviar, cada código, tamaño y cantidad se verificará contra el inventario disponible.','正式接入后，提交时会统一检查每个色号、规格和数量的可售库存。'],
    ['The final review verifies color, size, quantity, inventory, delivery address, shipping, and tax before card payment.','最終確認ではカード決済前に色、サイズ、数量、在庫、配送先、送料、税を確認します。','최종 검토에서 카드 결제 전에 색상, 규격, 수량, 재고, 배송 주소, 배송비 및 세금을 확인합니다.','La revisión final verifica color, tamaño, cantidad, inventario, dirección, envío e impuestos antes del pago.','正式版本将在这里核对颜色、规格、数量、库存、收货地址、运费和税费，确认无误后才进入信用卡付款。'],
    ['MY ORDERS / ACCOUNT','注文／アカウント','주문 / 계정','PEDIDOS / CUENTA','我的订单 / 账户'],
    ['UNIFIED CHECKOUT','統合会計','통합 결제','PAGO UNIFICADO','统一结账'],
    ['← CONTINUE SHOPPING','← 買い物を続ける','← 계속 쇼핑하기','← SEGUIR COMPRANDO','← 返回继续选货'],
    ['QUAD FILM · DEALER ORDERING','QUAD FILM・販売店発注','QUAD FILM · 딜러 주문','QUAD FILM · PEDIDOS DE DISTRIBUIDOR','QUAD FILM · 经销商订购'],
    ['REVIEW ORDER & PAY','注文確認・支払い','주문 검토 및 결제','REVISAR PEDIDO Y PAGAR','核对订单并付款'],
    ['After sign-in, the server verifies your dealer pricing and warehouse inventory before opening Stripe Test Secure Checkout.','ログイン後、Stripeテスト決済を開く前にサーバーが販売店価格と倉庫在庫を確認します。','로그인 후 Stripe 테스트 결제를 열기 전에 서버가 딜러 가격과 창고 재고를 확인합니다.','Después de iniciar sesión, el servidor verifica precio e inventario antes de abrir Stripe de prueba.','登录后，服务器会先核验经销商价格和仓库库存，再进入 Stripe 测试安全结账。'],
    ['After sign-in, the server verifies your dealer pricing and warehouse inventory before opening Stripe Live Secure Checkout.','ログイン後、Stripe本番決済を開く前にサーバーが販売店価格と倉庫在庫を確認します。','로그인 후 Stripe 실결제를 열기 전에 서버가 딜러 가격과 창고 재고를 확인합니다.','Después de iniciar sesión, el servidor verifica precio e inventario antes de abrir Stripe en vivo.','登录后，服务器会先核验经销商价格和仓库库存，再进入 Stripe 正式安全结账。'],
    ['This order is missing a delivery method. Please contact customer service to confirm delivery or warehouse pickup before payment.','この注文には配送方法がありません。お支払い前にカスタマーサービスへ連絡し、配送または倉庫受取を確認してください。','이 주문에 배송 방법이 없습니다. 결제 전에 고객 서비스에 연락하여 배송 또는 창고 픽업을 확인하세요.','A este pedido le falta el método de entrega. Comuníquese con servicio al cliente para confirmar el envío o la recolección en almacén antes de pagar.','订单缺少配送方式，请联系客服确认发货或仓库自提后再付款。'],
    ['Inventory allocation failed. Please check the selected models and quantities.','在庫の割り当てに失敗しました。選択した型番と数量を確認してください。','재고 할당에 실패했습니다. 선택한 모델과 수량을 확인하세요.','No se pudo asignar el inventario. Revise los modelos y las cantidades seleccionados.','库存分配失败，请检查所选型号和数量。'],
    ['ORDER ITEMS','注文商品','주문 상품','ARTÍCULOS DEL PEDIDO','订单商品'],
    ['Your cart is empty. Return to the product categories to select products.','カートは空です。製品カテゴリーに戻って商品を選択してください。','장바구니가 비어 있습니다. 제품 카테고리로 돌아가 상품을 선택하세요.','Su carrito está vacío. Regrese a las categorías para elegir productos.','购物车为空，请返回产品分类选择商品。'],
    ['＋ ADD MORE PRODUCTS','＋ 商品を追加','＋ 상품 더 추가','＋ AGREGAR MÁS PRODUCTOS','＋ 继续添加产品'],
    ['DELIVERY INFORMATION','配送情報','배송 정보','DATOS DE ENTREGA','收货信息'],
    ['COMPANY / STORE NAME','会社／店舗名','회사 / 매장명','EMPRESA / TIENDA','公司 / 门店名称'],
    ['SHIPMENT (PARCEL / FREIGHT)','配送（宅配／貨物）','배송(택배 / 화물)','ENVÍO (PAQUETERÍA / CARGA)','发货（快递 / 物流）'],
    ['Customer service confirms shipping based on address, weight, and service level','カスタマーサービスが住所、重量、サービス条件に基づき送料を確認します','고객 서비스가 주소, 중량 및 서비스 수준에 따라 배송비를 확인합니다','Atención al cliente confirma el envío según dirección, peso y nivel de servicio','客服将根据地址、重量和服务等级确认运费'],
    ['PENDING','確認待ち','확인 대기','PENDIENTE','待确认'],
    ['Pickup notification after preparation · Subject to Las Vegas inventory','準備完了後に受取通知・ラスベガス在庫に準拠','준비 완료 후 픽업 안내 · 라스베이거스 재고 기준','Aviso de recolección al preparar · Sujeto al inventario de Las Vegas','备货完成后通知取货 · 以拉斯维加斯仓库存为准'],
    ['Pickup notification after preparation · Subject to Los Angeles inventory','準備完了後に受取通知・ロサンゼルス在庫に準拠','준비 완료 후 픽업 안내 · 로스앤젤레스 재고 기준','Aviso de recolección al preparar · Sujeto al inventario de Los Ángeles','备货完成后通知取货 · 以洛杉矶仓库存为准'],
    ['PAYMENT METHOD','支払方法','결제 방법','MÉTODO DE PAGO','付款方式'],
    ['SECURE PAYMENT','安全な支払い','안전 결제','PAGO SEGURO','安全支付'],
    ['CREDIT / DEBIT CARD','クレジット／デビットカード','신용 / 직불카드','TARJETA DE CRÉDITO / DÉBITO','信用卡 / 借记卡'],
    ['Card number, expiration date, CVC, and billing address are entered only on Stripe Secure Checkout. Eligible Apple devices will automatically offer Apple Pay.','カード番号、有効期限、CVC、請求先住所はStripe安全決済画面でのみ入力します。対応Apple端末ではApple Payが自動表示されます。','카드 번호, 만료일, CVC 및 청구 주소는 Stripe 보안 결제에서만 입력합니다. 지원되는 Apple 기기에서는 Apple Pay가 자동 표시됩니다.','El número de tarjeta, vencimiento, CVC y dirección se ingresan solo en Stripe. Los dispositivos Apple compatibles mostrarán Apple Pay.','卡号、有效期、CVC 和账单地址只在 Stripe 安全结账页填写；符合条件的 Apple 设备会自动显示 Apple Pay。'],
    ['ORDER NOTES','注文メモ','주문 메모','NOTAS DEL PEDIDO','订单备注'],
    ['ORDER SUMMARY','注文概要','주문 요약','RESUMEN DEL PEDIDO','订单汇总'],
    ['PAYMENT DETAILS','支払明細','결제 내역','DETALLES DE PAGO','付款明细'],
    ['Wholesale Price','卸売価格','도매가','Precio mayorista','批发价'],
    ['Wholesale','卸売','도매','Mayorista','批发价'],
    ['Your Price','お客様価格','고객 가격','Su precio','客户价'],
    ['of wholesale','卸売価格比','도매가 대비','del precio mayorista','为批发价的'],
    ['Server verification','サーバー確認','서버 확인','Verificación del servidor','服务器核验'],
    ['Dealer Level','販売店ランク','딜러 등급','Nivel de distribuidor','客户价格等级'],
    ['Dealer Price','販売店価格','딜러 가격','Precio de distribuidor','客户价'],
    ['Your Savings','割引額','할인 금액','Su ahorro','本单优惠'],
    ['Calculated by server','サーバー計算','서버 계산','Calculado por el servidor','由服务器计算'],
    ['Discounted Subtotal','割引後小計','할인 후 소계','Subtotal con descuento','折后商品小计'],
    ['Shipping','送料','배송비','Envío','配送费'],
    ['Pending','確認待ち','확인 대기','Pendiente','待确认'],
    ['Sales Tax','消費税','판매세','Impuesto sobre ventas','销售税'],
    ['Calculated from the delivery or pickup location','配送先または受取場所から計算','배송 또는 픽업 위치를 기준으로 계산','Calculado según la entrega o recolección','根据收货或自提地点计算'],
    ['Confirmed by Stripe','Stripeで確定','Stripe에서 확정','Confirmado por Stripe','由 Stripe 确认'],
    ['PAY FOR PRODUCTS (SHIPPING CONFIRMED LATER)','商品代金を支払う（送料は後で確定）','상품 결제(배송비 추후 확정)','PAGAR PRODUCTOS (ENVÍO POR CONFIRMAR)','支付商品款（运费稍后确认）'],
    ['Stripe test mode is active. No real charge will be made.','Stripeテストモードです。実際の請求は発生しません。','Stripe 테스트 모드입니다. 실제 결제는 발생하지 않습니다.','Stripe está en modo de prueba. No se realizará un cargo real.','Stripe 当前为测试模式，不会产生真实扣款。'],
    ['Stripe live mode is active. Confirming payment will create a real charge.','Stripe本番モードです。支払い確定で実際に請求されます。','Stripe 실결제 모드입니다. 결제를 확인하면 실제 청구됩니다.','Stripe está en modo real. Confirmar el pago generará un cargo real.','Stripe 当前为正式模式，确认付款将产生真实扣款。'],
    ['✓ PAY AFTER INVENTORY VERIFICATION','✓ 在庫確認後に支払い','✓ 재고 확인 후 결제','✓ PAGAR TRAS VERIFICAR INVENTARIO','✓ 库存确认后付款'],
    ['✓ SECURE U.S. CARD PAYMENT','✓ 米国カードの安全決済','✓ 안전한 미국 카드 결제','✓ PAGO SEGURO CON TARJETA DE EE. UU.','✓ 美国信用卡安全支付'],
    ['✓ UNIFIED ORDER & SHIPPING TRACKING','✓ 注文・配送を一元追跡','✓ 주문 및 배송 통합 추적','✓ SEGUIMIENTO UNIFICADO DE PEDIDO Y ENVÍO','✓ 订单与物流统一跟踪'],
    ['After sign-in, delivery details are saved to your account and filled in automatically next time.','ログイン後、配送情報はアカウントに保存され、次回自動入力されます。','로그인 후 배송 정보가 계정에 저장되어 다음 결제 시 자동 입력됩니다.','Después de iniciar sesión, los datos se guardan y se completan automáticamente la próxima vez.','登录后，收货资料会保存到账户，下次自动填写。'],
    ['My Orders','注文履歴','내 주문','Mis pedidos','我的订单'],
    ['You do not have any orders yet.','注文はまだありません。','아직 주문이 없습니다.','Aún no tiene pedidos.','您还没有订单。'],
    ['QUAD DEALER STATUS','QUAD販売店ステータス','QUAD 딜러 상태','ESTADO DEL DISTRIBUIDOR QUAD','QUAD 经销商等级'],
    ['Wholesale Dealer','卸売販売店','도매 딜러','Distribuidor mayorista','批发客户'],
    ['Complete another $0.00 in paid purchases this month to reach the next level.','今月あと$0.00の支払済み購入で次のランクに到達します。','이번 달 결제 완료 구매 $0.00을 추가하면 다음 등급에 도달합니다.','Complete otros $0.00 en compras pagadas este mes para subir de nivel.','本月再完成 $0.00 已付款采购即可升级。'],
    ['This Month: $0.00','今月：$0.00','이번 달: $0.00','Este mes: $0.00','本月：$0.00'],
    ['Goal: $0.00','目標：$0.00','목표: $0.00','Meta: $0.00','目标：$0.00'],
    ['WHOLESALE','卸売','도매','MAYORISTA','批发'],
    ['SILVER','シルバー','실버','PLATA','银牌'],
    ['GOLD','ゴールド','골드','ORO','金牌'],
    ['Reach Silver with $10,000 in paid monthly purchases and Gold with $20,000. Two consecutive full months below your current threshold lower your status by one level.','月間支払済み購入$10,000でシルバー、$20,000でゴールド。現在基準を2か月連続で下回ると1ランク下がります。','월 결제 완료 구매 $10,000이면 실버, $20,000이면 골드입니다. 현재 기준에 두 달 연속 미달하면 한 등급 하락합니다.','Alcance Plata con $10,000 pagados al mes y Oro con $20,000. Dos meses seguidos bajo el umbral reducen un nivel.','月度已付款采购达到 $10,000 升银牌、$20,000 升金牌；连续两个完整月份低于当前门槛会降一级。'],
    ['My Account','アカウント','내 계정','Mi cuenta','我的账户'],
    ['Order Total','注文合計','주문 합계','Total de pedidos','订单总额'],
    ['Balance Due','未払残高','미납 잔액','Saldo pendiente','待付余额'],
    ['Product Warranties','製品质保','제품 보증','Garantías de productos','产品质保'],
    ['No warranty registrations are currently linked to this account.','このアカウントに紐づく製品質保登録はありません。','이 계정에 연결된 제품 보증 등록이 없습니다.','No hay registros de garantía vinculados a esta cuenta.','当前没有与此账户关联的产品质保记录。'],
    ['To update your account information or contract pricing, contact your sales representative','アカウント情報または契約価格の変更は担当営業にご連絡ください','계정 정보 또는 계약 가격을 변경하려면 담당 영업사원에게 문의하세요','Para actualizar su cuenta o precio de contrato, contacte a su representante','如需更新账户资料或协议价，请联系您的业务员'],
    ['Bronze Dealer','ブロンズ販売店','브론즈 딜러','Distribuidor Bronce','铜牌客户'],
    ['Silver Dealer','シルバー販売店','실버 딜러','Distribuidor Plata','银牌客户'],
    ['Gold Dealer','ゴールド販売店','골드 딜러','Distribuidor Oro','金牌客户'],
    ['Strategic Partner','戦略パートナー','전략 파트너','Socio estratégico','超级战略合作伙伴'],
    ['Bronze Dealer Price','ブロンズ販売店価格','브론즈 딜러 가격','Precio Bronce','铜牌价'],
    ['Silver Dealer Price','シルバー販売店価格','실버 딜러 가격','Precio Plata','银牌价'],
    ['Gold Dealer Price','ゴールド販売店価格','골드 딜러 가격','Precio Oro','金牌价'],
    ['Strategic Partner Price','戦略パートナー価格','전략 파트너 가격','Precio de socio estratégico','超级战略合作伙伴价'],
    ['Quantity','数量','수량','Cantidad','数量'],
    ['Remove product','商品を削除','상품 삭제','Eliminar producto','删除商品'],
    ['Shown after sign-in','ログイン後に表示','로그인 후 표시','Visible después de iniciar sesión','登录后显示'],
    ['Identified after sign-in','ログイン後に判定','로그인 후 확인','Identificado después de iniciar sesión','登录后识别'],
    ['Calculated after sign-in','ログイン後に計算','로그인 후 계산','Calculado después de iniciar sesión','登录后计算'],
    ['Sign in to view your price','ログインして価格を表示','로그인하여 가격 확인','Inicie sesión para ver su precio','登录后查看价格'],
    ['Saving delivery information…','配送情報を保存中…','배송 정보 저장 중…','Guardando datos de entrega…','正在保存收货资料…'],
    ['✓ Delivery information saved for your next checkout.','✓ 次回決済用に配送情報を保存しました。','✓ 다음 결제를 위해 배송 정보를 저장했습니다.','✓ Datos guardados para la próxima compra.','✓ 收货资料已保存，供下次结账使用。'],
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
    '隔热率':'HEAT REJECTION','加入订单':'ADD TO ORDER','当前订单':'CURRENT ORDER','去结账':'CHECK OUT','下一步：去结账 →':'NEXT: CHECKOUT →','删除这一项':'Remove product','继续添加产品':'CONTINUE SHOPPING',
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
  const missingTranslations = new Set();
  const translatedTextNodes = new WeakSet();
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
    if (locale !== 'zh-CN' && /[\u3400-\u9fff]/.test(text)) {
      missingTranslations.add(text);
      return {
        en:'Content is not available in English.',
        ja:'この内容の日本語訳はまだありません。',
        ko:'이 콘텐츠의 한국어 번역이 아직 없습니다.',
        'es-MX':'Este contenido aún no está disponible en español.'
      }[locale];
    }
    return value;
  }
  function translateValue(value) {
    const text = normalize(value);
    if (!text) return value;
    const itemCount = text.match(/^(\d+)\s*(?:项|ITEMS?)$/i);
    if (itemCount) {
      const count = itemCount[1];
      const suffix = {en:Number(count)===1?'ITEM':'ITEMS',ja:'点',ko:'개','es-MX':Number(count)===1?'ARTÍCULO':'ARTÍCULOS','zh-CN':'项'}[locale];
      return `${count} ${suffix}`;
    }
    const rollCount = text.match(/^(\d+)\s+ROLLS?$/i);
    if (rollCount) {
      const count = rollCount[1];
      const suffix = {en:Number(count)===1?'ROLL':'ROLLS',ja:'巻',ko:'롤','es-MX':Number(count)===1?'ROLLO':'ROLLOS','zh-CN':'卷'}[locale];
      return `${count} ${suffix}`;
    }
    const nextTier = text.match(/^Complete another (\$[\d,.]+) in paid purchases this month to reach the next level\.$/);
    if (nextTier) return ({en:`Complete another ${nextTier[1]} in paid purchases this month to reach the next level.`,ja:`今月あと${nextTier[1]}の支払済み購入で次のランクに到達します。`,ko:`이번 달 결제 완료 구매 ${nextTier[1]}을 추가하면 다음 등급에 도달합니다.`,'es-MX':`Complete otros ${nextTier[1]} en compras pagadas este mes para subir de nivel.`,'zh-CN':`本月再完成 ${nextTier[1]} 已付款采购即可升级。`})[locale];
    const monthlyAmount = text.match(/^(This Month|Goal):\s*(\$[\d,.]+)$/);
    if (monthlyAmount) {
      const label = monthlyAmount[1] === 'Goal'
        ? {en:'Goal',ja:'目標',ko:'목표','es-MX':'Meta','zh-CN':'目标'}[locale]
        : {en:'This Month',ja:'今月',ko:'이번 달','es-MX':'Este mes','zh-CN':'本月'}[locale];
      return `${label}: ${monthlyAmount[2]}`;
    }
    const invalidSku = text.match(/^(.+?)\s+不是当前可购买的正式 SKU，请返回产品页重新选择。$/);
    if (invalidSku) return ({en:`${invalidSku[1]} is not a currently purchasable SKU. Return to the product page and select it again.`,ja:`${invalidSku[1]} は現在購入できる正式SKUではありません。商品ページに戻って選び直してください。`,ko:`${invalidSku[1]}은(는) 현재 구매 가능한 정식 SKU가 아닙니다. 제품 페이지로 돌아가 다시 선택하세요.`,'es-MX':`${invalidSku[1]} no es un SKU disponible actualmente. Regrese a la página del producto y selecciónelo de nuevo.`,'zh-CN':text})[locale];
    const direct = dictionaries[locale].get(text);
    if (direct) return String(value).replace(text, direct);
    if (locale === 'en') {
      const exactEnglish = chineseEnglish.get(text);
      if (exactEnglish) return String(value).replace(text, exactEnglish);
      let translatedEnglish = String(value);
      for (const [source, replacement] of chineseEnglish) {
        if (source.length >= 4 && translatedEnglish.includes(source)) translatedEnglish = translatedEnglish.split(source).join(replacement);
      }
      if (translatedEnglish !== String(value)) return translatedEnglish;
    }
    let translated = String(value);
    for (const row of rows) {
      for (const source of row) {
        if (!source || source.length < 2 || !translated.includes(source)) continue;
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
    nodes.forEach(node => {
      if (translatedTextNodes.has(node) || node.parentElement?.closest('script,style,.quad-language-picker,[data-i18n-user-content]')) return;
      node.nodeValue=translateValue(node.nodeValue);
      translatedTextNodes.add(node);
    });
    root.querySelectorAll?.('[placeholder],[title],[aria-label]').forEach(el => { if(el.closest('[data-i18n-user-content]'))return; ['placeholder','title','aria-label'].forEach(a => { if(el.hasAttribute(a)) el.setAttribute(a,translateValue(el.getAttribute(a))); }); });
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
  const nativeAlert = window.alert.bind(window);
  window.alert = message => nativeAlert(translateValue(String(message ?? '')));
  let queued=false;
  new MutationObserver(mutations=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;injectPickers();mutations.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1)translateRoot(n);else if(n.nodeType===3&&n.parentElement)translateRoot(n.parentElement);}));});}).observe(document.body,{childList:true,subtree:true});
  window.QuadI18n={ get locale(){return locale;}, setLocale, t:translateValue, translateRoot, getMissingTranslations:()=>[...missingTranslations], supported:[...supported] };
})();
