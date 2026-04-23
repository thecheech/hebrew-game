/**
 * Generates data/words.json from compact pipe-delimited rows:
 * hebrew|translit|english (comma-separated if multiple)|difficulty|level
 * Run: node scripts/seed-words.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const rows = `
אִמָּא|imma|mother|1|1
אַבָּא|aba|father|1|1
כֵּן|ken|yes|1|1
לֹא|lo|no|1|1
מַיִם|mayim|water|1|1
בַּיִת|bayit|house|1|1
כֶּלֶב|kelev|dog|1|2
חָתוּל|chatul|cat|1|2
יֶלֶד|yeled|boy,child|1|2
יַלְדָּה|yaldah|girl|1|2
סֵפֶר|sefer|book|1|3
שֻׁלְחָן|shulchan|table|1|3
כִּסֵּא|kise|chair|1|3
דֶּלֶת|delet|door|1|3
חַלּוֹן|chalon|window|1|4
אֹכֶל|ochel|food|1|4
לֶחֶם|lechem|bread|1|4
חָלָב|chalav|milk|1|4
בֵּיצָה|beitzah|egg|1|5
תַּפּוּחַ|tapuach|apple|1|5
עֵץ|etz|tree|1|5
פְּרָח|perach|flower|1|5
שֶׁמֶשׁ|shemesh|sun|1|6
יָרֵחַ|yareach|moon|1|6
כּוֹכָב|kokhav|star|1|6
שָׁמַיִם|shamayim|sky,heaven|1|6
אָרֶץ|eretz|earth,land|1|7
יָם|yam|sea|1|7
נָהָר|nahar|river|1|7
הַר|har|mountain|1|7
אֲנִי|ani|I|1|1
אַתָּה|ata|you (m)|1|2
אַתְּ|at|you (f)|1|2
הוּא|hu|he|1|3
הִיא|hi|she|1|3
אֲנַחְנוּ|anachnu|we|1|4
הֵם|hem|they (m)|1|5
הֵן|hen|they (f)|1|5
זֶה|zeh|this (m)|1|3
זֹאת|zot|this (f)|1|3
מָה|mah|what|1|4
מִי|mi|who|1|4
אֵיפֹה|eifo|where|1|5
לָמָה|lama|why|1|5
אֵיךְ|eich|how|1|6
כַּמָּה|kama|how much|1|6
הַיּוֹם|hayom|today|1|7
מָחָר|machar|tomorrow|1|7
אֶתְמוֹל|etmol|yesterday|1|7
עַכְשָׁיו|achshav|now|1|6
אָז|az|then|1|6
כָּאן|kan|here|1|5
שָׁם|sham|there|1|5
טוֹב|tov|good|1|4
רַע|ra|bad|1|5
גָּדוֹל|gadol|big|1|5
קָטָן|katan|small|1|5
חָדָשׁ|chadash|new|1|6
יָשָׁן|yashan|old|1|6
חַם|cham|hot|1|6
קַר|kar|cold|1|6
מֶהֱרָה|meherah|quickly|1|7
לְאַט|le'at|slowly|1|7
שָׁלוֹם|shalom|peace,hello|2|8
תּוֹדָה|toda|thanks|2|8
בְּבַקָּשָׁה|bevakasha|please|2|8
סְלִיחָה|slicha|sorry,excuse me|2|9
בֹּקֶר טוֹב|boker tov|good morning|2|9
לַיְלָה טוֹב|laylah tov|good night|2|9
שָׁבוּעַ טוֹב|shavua tov|good week|2|10
חַג שָׂמֵחַ|chag sameach|happy holiday|2|10
מָזָל טוֹב|mazal tov|congratulations|2|10
בְּרִיאוּת|briut|health (toast)|2|11
מִסְפָּר|mispar|number|2|11
שָׁעָה|sha'ah|hour|2|11
דַּקָּה|dakah|minute|2|11
שָׁנָה|shanah|year|2|12
חֹדֶשׁ|chodesh|month|2|12
שָׁבוּעַ|shavua|week|2|12
יוֹם|yom|day|2|12
לַיְלָה|laylah|night|2|13
בֹּקֶר|boker|morning|2|13
עֶרֶב|erev|evening|2|13
מִשְׁפָּחָה|mishpacha|family|2|14
חָבֵר|chaver|friend (m)|2|14
חָבֵרָה|chaverah|friend (f)|2|14
אָח|ach|brother|2|8
אָחוֹת|achot|sister|2|9
סָבָא|saba|grandfather|2|10
סָבְתָא|savta|grandmother|2|10
מוֹרֶה|moreh|teacher (m)|2|11
מוֹרָה|morah|teacher (f)|2|11
תַּלְמִיד|talmid|student (m)|2|12
תַּלְמִידָה|talmidah|student (f)|2|12
בֵּית סֵפֶר|beit sefer|school|2|13
אוּנִיבֶרְסִיטָה|universita|university|2|14
עִבְרִית|ivrit|Hebrew|2|9
אַנְגְּלִית|anglit|English|2|9
לָשׁוֹן|lashon|language|2|10
מִלָּה|milah|word|2|10
מַחְשֵׁב|machshev|computer|2|11
טֵלֵפוֹן|telefon|telephone|2|11
מְכוֹנִית|mechonit|car|2|12
אוֹטוֹבּוּס|otobus|bus|2|12
רַכֶּבֶת|rakevet|train|2|13
מָטוֹס|matos|airplane|2|13
עִיר|ir|city|2|14
כְּפָר|kfar|village|2|14
רְחוֹב|rechov|street|2|14
חֲנוּת|chanut|shop|2|13
כֶּסֶף|kesef|money,silver|2|12
לִקְנוֹת|liknot|to buy|2|13
לִמְכֹּר|limkor|to sell|2|14
לֶאֱכֹל|le'echol|to eat|2|11
לִשְׁתּוֹת|lishtot|to drink|2|11
לִישׁוֹן|lishon|to sleep|2|12
לָלֶכֶת|lalechet|to walk,to go|2|12
לָרוּץ|larutz|to run|2|13
לִרְאוֹת|lirot|to see|2|13
לִשְׁמֹעַ|lishmoa|to hear|2|14
לְדַבֵּר|ledaber|to speak|2|14
לִכְתֹּב|lichtov|to write|2|14
לִקְרֹא|likro|to read|2|13
לִלְמֹד|lilmod|to learn|2|14
לְהַבִּין|lehavin|to understand|2|15
לִזְכּוֹר|lizkor|to remember|2|15
לִשְׁכּוֹחַ|lishkoch|to forget|2|15
לֶאֱהֹב|le'ehov|to love|2|14
לִשְׂנֹא|lisno|to hate|2|15
שִׂמְחָה|simcha|joy|3|15
עֶצֶב|etzev|sadness|3|15
פַּחַד|pachad|fear|3|16
בִּטָּחוֹן|bitachon|confidence,security|3|16
אַחְרָיוּת|achrayut|responsibility|3|17
חֵרוּת|cherut|freedom|3|17
צֶדֶק|tzedek|justice|3|17
שָׁלוֹם בַּיִת|shalom bayit|domestic peace|3|16
מַחְשָׁבוֹת|machshavot|thoughts|3|17
הַמְצָאָה|hamtza'ah|invention|3|18
מַדָּע|mada|science|3|18
טֶבַע|teva|nature|3|18
סְבִיבָה|sviva|environment|3|18
מַעֲרֶכֶת|ma'arechet|system|3|19
מַמְשָׁךְ|mamshach|continuum|3|19
הִתְחַלְתִּי|hitchalti|I started|3|20
אֶכְתֹּב|echtov|I will write|3|20
נִלְמַד|nilmad|it is learned|3|19
נִכְתַּב|nichtav|it was written|3|19
הִתְקַדַּמְתִּי|hitkadamti|I advanced|3|20
הִסְבַּרְתִּי|hisbarti|I explained|3|20
הִתְמוֹדְדוּת|hitmodedut|coping|3|20
הִתְחַבְּרוּת|hitchabrut|connection|3|19
וִירְטוּאָלִי|virtuali|virtual|3|18
מַצּוּב|matzuv|situated|3|18
הִתְנַגְּדוּת|hitnagdut|opposition|3|19
הִתְיַשְּׁבוּת|hityashvut|settlement|3|19
מַחְלָקָה|machlaka|department|3|17
מִשְׁפָּט|mishpat|trial,law|3|16
חֹק|chok|law|3|16
מֶמְשָׁלָה|memshala|government|3|17
בְּחִירוֹת|bechirot|elections|3|18
כּוֹכָב לֶכֶת|kokhav lechet|planet|3|17
חַלָּל|chalal|space|3|17
אֲנָשִׁים|anashim|people|2|10
נָשִׁים|nashim|women|2|11
יְלָדִים|yeladim|children|2|12
זְקֵנִים|zekenim|elders|2|13
רוֹפֵא|rofe|doctor (m)|2|11
אַחַר|achar|after|2|9
לִפְנֵי|lifnei|before|2|10
עִם|im|with|2|8
בְּלִי|bli|without|2|11
בִּגְלַל|biglal|because of|2|12
לְמַעַן|lema'an|for the sake of|2|13
אֶל|el|to,toward|2|9
מִן|min|from|2|10
עַד|ad|until|2|10
עַל|al|on,about|2|8
תַּחַת|tachat|under|2|11
מֵעַל|me'al|above|2|12
בֵּין|bein|between|2|11
שָׁלוֹשׁ|shalosh|three (f)|1|6
אַרְבַּע|arba|four (f)|1|6
חָמֵשׁ|chamesh|five (f)|1|6
שִׁשָּׁה|shishah|six (m)|1|7
שִׁבְעָה|shiv'ah|seven (m)|1|7
שְׁמוֹנָה|shmonah|eight (f)|1|7
תִּשְׁעָה|tish'ah|nine (m)|1|7
עֲשָׂרָה|asarah|ten (m)|1|7
רֹאשׁ|rosh|head|2|9
יָד|yad|hand|2|9
רֶגֶל|regel|foot,leg|2|10
עַיִן|ayin|eye|2|10
אֹזֶן|ozen|ear|2|10
פֶּה|peh|mouth|2|10
לֵב|lev|heart|2|11
נֶפֶשׁ|nefesh|soul|3|16
רוּחַ|ruach|wind,spirit|3|16
גּוּף|guf|body|2|11
דָּם|dam|blood|3|15
עֶצֶם|etzem|bone|3|15
שִׁנַּיִם|shinayim|teeth|2|12
שֵׂעָר|se'ar|hair|2|12
עוֹר|or|skin|3|15
צִבְעוֹן|tzevon|color|3|16
אָדוֹם|adom|red|1|5
כָּחוֹל|kachol|blue|1|5
יָרוֹק|yarok|green|1|5
צָהוֹב|tzahov|yellow|1|5
שָׁחוֹר|shachor|black|1|6
לָבָן|lavan|white|1|6
אֶפְשָׁר|efshar|possible|3|17
בִּלְתִּי אֶפְשָׁר|bilti efshar|impossible|3|18
חָשׁוּב|chashuv|important|3|16
פָּשׁוּט|pashut|simple|3|16
מֻרְכָּב|murkav|complex|3|17
בְּרוּר|barur|clear|3|17
מְבֻלְבָּל|mevulbal|confused|3|18
מְעֻנְיָן|me'anyan|interested|3|18
מְשׁוּעֲמָם|meshu'amam|bored|3|18
מְאֻשָּׁר|me'ushar|happy (adj)|3|17
עָצוּב|atzuv|sad (adj)|3|17
עָיֵף|ayef|tired|2|13
דֶּשֶׁא|deshe|grass|1|6
עָנָן|anan|cloud|1|7
גֶּשֶׁם|geshem|rain|2|10
שֶׁלֶג|sheleg|snow|2|11
אֵשׁ|esh|fire|2|9
אֲוִיר|avir|air|2|11
אֶבֶן|even|stone|2|10
חוֹמָה|chomah|wall|2|12
גֶּג|gag|roof|2|11
מִטָּה|mitah|bed|2|10
כִּסּוּא|kiso|toilet|2|12
מִקְלַחַת|miklachat|shower|2|13
מִטְבָּח|mitbach|kitchen|2|12
סָלוֹן|salon|living room|2|13
מַחְבֵּרֶת|machberet|notebook|2|11
עֵט|et|pen|1|5
עִיפָרוֹן|iparon|pencil|1|6
תִּיק|tik|bag|2|9
מַפְתֵּחַ|mafte'ach|key|2|10
דֶּלְתוֹן|delton|window shutter|2|14
מַזְגָּן|mazgan|air conditioner|2|14
מַכְשִׁיר|machshir|appliance|3|16
חַשְׁמַל|chashmal|electricity|3|17
אוֹר|or|light|2|9
חֹשֶׁךְ|choshech|darkness|3|16
צָהֳרַיִם|tzohorayim|noon|2|12
חֲצוֹת|chatzot|midnight|3|16
פִּנָּה|pinah|corner|2|11
קִיר|kir|wall (interior)|2|11
רִצְפָּה|ritzpa|floor|2|12
תִּקְרָה|tikrah|ceiling|2|13
מַעֲלָה|ma'alah|stairs|3|16
מַעֲלִית|ma'alit|elevator|3|17
מִזְרָח|mizrach|east|3|15
מַעֲרָב|ma'arav|west|3|15
צָפוֹן|tzafon|north|3|15
דָּרוֹם|darom|south|3|15
אִי|ee|island|2|11
חוֹף|chof|beach|2|11
מִדְבָּר|midbar|desert|3|16
יַעַר|ya'ar|forest|2|12
שָׂדֶה|sadeh|field|2|11
גָּנָן|ganan|gardener|3|17
זֶרַע|zera|seed|3|15
פְּרִי|pri|fruit|2|10
יָרָק|yarak|vegetable|2|11
בָּשָׂר|basar|meat|2|11
דָּג|dag|fish|2|9
עוֹף|of|chicken,bird|2|10
גְּבִינָה|gvinah|cheese|2|11
חֶמְאָה|chem'ah|butter|2|12
מֶלַח|melach|salt|2|10
סֻכָּר|sukar|sugar|2|11
קָפֶה|kafeh|coffee|2|10
תֵּה|teh|tea|1|5
מִיץ|mitz|juice|2|10
יַיִן|yayin|wine|2|11
בִּירָה|birah|beer|2|11
מַשְׁקֶה|mashkeh|beverage|3|16
אֲרוּחָה|arucha|meal|2|12
רָעֵב|ra'ev|hungry|2|13
שׂבֵעַ|savea|full,satisfied|2|14
צָמֵא|tzame|thirsty|2|14
חוֹלֶה|choleh|sick|2|14
בָּרִיא|bari|healthy|2|14
חַם לְבָב|cham levav|warm-hearted|3|19
קַר רוּחַ|kar ruach|cold-hearted|3|19
בּוֹא|bo|come (m)|1|1
לֵךְ|lech|go (m)|1|1
שֵׁב|shev|sit (m)|1|1
קוּם|kum|get up (m)|1|1
שֵׁם|shem|name|1|1
חַי|chai|alive,life|1|1
מֵת|met|dead|1|1
אַף|af|nose|1|1
עַכְבָּר|achbar|mouse|1|2
פָּרָה|para|cow|1|2
סוּס|sus|horse|1|2
חֲמוֹר|chamor|donkey|1|2
כֶּבֶשׂ|keves|sheep|1|2
עֵז|ez|goat|1|2
אֲרִי|ari|lion|1|2
פִּיל|pil|elephant|1|2
אַתֶּם|atem|you (pl m)|1|2
אַתֶּן|aten|you (pl f)|1|3
שֶׁלִּי|sheli|mine|1|3
שֶׁלְּךָ|shelcha|yours (m)|1|3
שֶׁלָּךְ|shelach|yours (f)|1|3
שֶׁלּוֹ|shelo|his|1|3
שֶׁלָּהּ|shela|hers|1|3
אֵיזֶה|eizeh|which (m)|1|4
אֵיזוֹ|eizo|which (f)|1|4
כָּל|kol|every,all|1|4
שׁוּב|shuv|again|1|4
כְּבָר|kvar|already|1|4
עוֹד|od|more,still|1|4
רַק|rak|only|1|4
בְּסֵדֶר|beseder|okay|2|8
כּוֹס|kos|cup,glass|2|8
צַלַּחַת|tzalachat|plate|2|8
מַזְלֵג|mazleg|fork|2|8
סַכִּין|sakin|knife|2|8
כַּף|kaf|spoon|2|8
שָׁעוֹן|sha'on|clock,watch|2|8
מַרְאָה|marah|mirror|2|9
כַּדּוּר|kadur|ball|2|9
בֻּבָּה|buba|doll|2|9
אוֹרֶז|orez|rice|2|10
פַּסְטָה|pasta|pasta|2|10
סָלָט|salat|salad|2|10
מָרָק|marak|soup|2|10
עוּגָה|uga|cake|2|10
שׁוֹקוֹלָד|shokolad|chocolate|2|10
גַּן|gan|garden,kindergarten|2|12
פַּארְק|park|park|2|12
שׁוּק|shuk|market|2|12
מִסְעָדָה|mis'ada|restaurant|2|13
בֵּית חוֹלִים|beit cholim|hospital|2|13
צַוָּאר|tzavar|neck|2|14
כָּתֵף|katef|shoulder|2|14
בֶּטֶן|beten|stomach|2|14
גַּב|gav|back|2|14
אֶצְבַּע|etzba|finger|2|14
בֶּרֶךְ|berech|knee|2|14
דּוֹד|dod|uncle|2|15
דּוֹדָה|doda|aunt|2|15
בֵּן|ben|son|2|15
בַּת|bat|daughter|2|15
בַּעַל|ba'al|husband|2|15
אִשָּׁה|isha|woman,wife|2|15
כֹּחַ|koach|strength|3|16
חֻלְשָׁה|chulshah|weakness|3|16
מַטָּרָה|matarah|goal|3|16
הַצְלָחָה|hatzlachah|success|3|17
כִּשָּׁלוֹן|kishalon|failure|3|17
וָרוֹד|varod|pink|2|18
כָּתוֹם|katom|orange|2|18
חוּם|chum|brown|2|18
סָגוֹל|sagol|purple|2|18
אָפוֹר|afor|gray|2|18
יָפֶה|yafeh|beautiful|3|19
גָּבוֹהַּ|gavoah|tall|3|19
נָמוּךְ|namuch|low,short|3|19
כָּבֵד|kaved|heavy|3|19
מָהִיר|mahir|fast|3|19
אִטִּי|iti|slow|3|19
לַעֲבֹד|la'avod|to work|3|20
לָבוֹא|lavo|to come|3|20
לָתֵת|latet|to give|3|20
לָקַחַת|lakachat|to take|3|20
לִשְׁאֹל|lishol|to ask|3|20
לַעֲנוֹת|la'anot|to answer|3|20
לְבַקֵּשׁ|levakesh|to request|3|20
לְחַכּוֹת|lechakot|to wait|3|20
לְהַחְלִיט|lehachlit|to decide|3|20
לְהַתְחִיל|lehatchil|to start|3|20
אָדֹן|adon|lord,master|2|16
אֶלֶף|elef|thousand|2|16
בָּנִים|banim|sons,children|2|16
בֶּגֶד|beged|garment,clothing|2|16
שַׁבָּת|shabbat|Sabbath|2|16
לְךָ|lecha|to you (m sg)|2|16
חֵן|chen|grace,favor|2|16
חֹרֶף|choref|winter|2|16
טָהוֹר|tahor|pure,clean|2|16
מֶלֶךְ|melech|king|2|16
נָשָׂא|nasa|lifted,bore,carried|2|17
סָרוּ|saru|they turned aside|3|17
פַּעַם|pa'am|once,occasion|2|17
בָּרוּךְ|baruch|blessed|2|17
טוֹבִים|tovim|good (m pl)|2|17
רַחֵם|rachem|have mercy|2|17
קַו|kav|line,cord|2|17
רָחַץ|rachatz|washed|2|17
קֶדֶם|kedem|east,antiquity|2|17
כָּנָף|kanaf|wing,corner|2|18
לֵוִי|levi|Levi|2|18
מָגֵן|magen|shield|2|18
רַד|rad|went down|2|18
שָׂרָה|sarah|Sarah|2|18
אָהַב|ahav|loved|2|18
נָתַן|natan|gave|2|18
אָבֵל|avel|mourning,mourner|2|18
סוּר|sur|turn aside|2|19
אָמַר|amar|said|2|19
עָבַר|avar|passed,crossed|2|19
אָסַף|asaf|gathered|2|19
שָׁאַל|sha'al|asked|2|19
שָׂנָא|sana|hated|2|19
זוּלָתוֹ|zulato|except him,besides him|3|19
נֵר|ner|lamp,candle|2|19
וָלֶד|valed|child,offspring|2|20
לֵבָב|levav|heart|2|20
צָרָה|tzarah|trouble,distress|2|20
מַתָּנָה|matana|gift|2|20
שֶׁבֶץ|shevetz|ornament,setting|3|20
עֵגֶל|egel|calf|2|20
אָקוּם|akum|I will arise|3|20
טַבַּעַת|taba'at|ring|2|20
חָמֵץ|chametz|leaven|2|20
לָרֶדֶת|laredet|to descend|2|20
שָׁוֶה|shaveh|equal,worth|2|20
בָּם|bam|in them (m)|3|20
וַיְהִי|vayhi|and it was,and it came to pass|2|miketz-raw
מִקֵּץ|miketz|at the end of|2|miketz-raw
שְׁנָתַיִם|shnatayim|two years|2|miketz-raw
יָמִים|yamim|days|1|miketz-raw
וּפַרְעֹה|ufaroh|and Pharaoh|2|miketz-raw
חֹלֵם|cholem|dreaming|2|miketz-raw
וְהִנֵּה|vehineh|and behold|2|miketz-raw
עֹמֵד|omed|standing|2|miketz-raw
עַל|al|on,upon|1|miketz-raw
הַיְאֹר|hayeor|the Nile,the river|2|miketz-raw
מִן|min|from|1|miketz-raw
עֹלוֹת|olot|coming up (f pl)|2|miketz-raw
שֶׁבַע|sheva|seven|1|miketz-raw
פָּרוֹת|parot|cows|2|miketz-raw
יְפוֹת|yefot|beautiful (f pl)|2|miketz-raw
מַרְאֶה|mareh|appearance|2|miketz-raw
וּבְרִיאֹת|uveriot|and fat (f pl)|3|miketz-raw
בָּשָׂר|basar|flesh|2|miketz-raw
וַתִּרְעֶינָה|vatirenah|and they grazed|3|miketz-raw
בָּאָחוּ|baachu|in the marsh|3|miketz-raw
אֲחֵרוֹת|acherot|other (f pl)|2|miketz-raw
אַחֲרֵיהֶן|achareihen|after them (f pl)|3|miketz-raw
רָעוֹת|raot|bad (f pl)|2|miketz-raw
וְדַקּוֹת|vedakot|and thin (f pl)|2|miketz-raw
וַתַּעֲמֹדְנָה|vataamodnah|and they stood|3|miketz-raw
אֵצֶל|etzel|beside,near|2|miketz-raw
הַפָּרוֹת|haparot|the cows|2|miketz-raw
שְׂפַת|sefat|edge of,bank of|2|miketz-raw
וַתֹּאכַלְנָה|vatochalnah|and they ate|3|miketz-raw
הַמַּרְאֶה|hamareh|the appearance|2|miketz-raw
הַבָּשָׂר|habasar|the flesh|2|miketz-raw
אֵת|et|(direct object marker)|1|miketz-raw
וְהַבְּרִיאֹת|vehaberiot|and the fat (f pl)|3|miketz-raw
וַיִּיקַץ|vayikatz|and he awoke|3|miketz-raw
פַּרְעֹה|paroh|Pharaoh|2|miketz-raw
וַיִּישָׁן|vayishan|and he slept|3|miketz-raw
וַיַּחֲלֹם|vayachalom|and he dreamed|3|miketz-raw
שֵׁנִית|shenit|a second time|2|miketz-raw
שִׁבֳּלִים|shibolim|ears of grain|3|miketz-raw
בְּקָנֶה|bekaneh|on a stalk|2|miketz-raw
אֶחָד|echad|one|1|miketz-raw
בְּרִיאוֹת|beriot|fat (f pl)|2|miketz-raw
וְטֹבוֹת|vetovot|and good (f pl)|2|miketz-raw
דַּקּוֹת|dakot|thin (f pl)|2|miketz-raw
וּשְׁדוּפֹת|ushdufot|and scorched (f pl)|3|miketz-raw
קָדִים|kadim|east wind|2|miketz-raw
צֹמְחוֹת|tzomchot|growing,sprouting (f pl)|3|miketz-raw
וַתִּבְלַעְנָה|vativlanah|and they swallowed|3|miketz-raw
הַשִּׁבֳּלִים|hashibolim|the ears of grain|3|miketz-raw
הַדַּקּוֹת|hadakot|the thin (f pl)|2|miketz-raw
הַבְּרִיאוֹת|haberiot|the fat (f pl)|3|miketz-raw
וְהַמְּלֵאוֹת|vehameleot|and the full (f pl)|3|miketz-raw
חֲלוֹם|chalom|dream|2|miketz-raw
בַבֹּקֶר|baboker|in the morning|2|miketz-raw
וַתִּפָּעֶם|vatipaem|and was troubled|3|miketz-raw
רוּחוֹ|rucho|his spirit|2|miketz-raw
וַיִּשְׁלַח|vayishlach|and he sent|2|miketz-raw
וַיִּקְרָא|vayikra|and he called|2|miketz-raw
כָּל|kol|all,every|1|miketz-raw
חַרְטֻמֵּי|chartumei|magicians of|3|miketz-raw
מִצְרַיִם|mitzrayim|Egypt|2|miketz-raw
וְאֵת|veet|and (direct object marker)|2|miketz-raw
חֲכָמֶיהָ|chachameha|her wise men|3|miketz-raw
וַיְסַפֵּר|vayesaper|and he told,recounted|2|miketz-raw
לָהֶם|lahem|to them|2|miketz-raw
חֲלֹמוֹ|chalomo|his dream|2|miketz-raw
וְאֵין|veein|and there is no|2|miketz-raw
פּוֹתֵר|poter|interpreter|2|miketz-raw
אוֹתָם|otam|them (m)|2|miketz-raw
לְפַרְעֹה|lefaroh|to Pharaoh|2|miketz-raw
וַיְדַבֵּר|vayedaber|and he spoke|2|miketz-raw
שַׂר|sar|chief,officer|2|miketz-raw
הַמַּשְׁקִים|hamashkim|the cupbearers|2|miketz-raw
לֵאמֹר|lemor|saying|2|miketz-raw
חֲטָאַי|chataai|my sins,my faults|3|miketz-raw
מַזְכִּיר|mazkir|recall,mention|2|miketz-raw
קָצַף|katzaf|was angry|2|miketz-raw
עֲבָדָיו|avadav|his servants|2|miketz-raw
וַיִּתֵּן|vayiten|and he placed,gave|2|miketz-raw
אֹתִי|oti|me|2|miketz-raw
בְּמִשְׁמַר|bemishmar|in custody,in confinement|3|miketz-raw
בֵּית|beit|house of|2|miketz-raw
הַטַּבָּחִים|hatabachim|the guards,the executioners|3|miketz-raw
הָאֹפִים|haofim|the bakers|2|miketz-raw
וַנַּחַלְמָה|vanachalmah|and we dreamed|3|miketz-raw
בְּלַיְלָה|belaylah|in a night|2|miketz-raw
וָהוּא|vahu|and he|2|miketz-raw
אִישׁ|ish|man,each|1|miketz-raw
כְּפִתְרוֹן|kefitron|according to interpretation of|3|miketz-raw
חָלָמְנוּ|chalamnu|we dreamed|2|miketz-raw
וְשָׁם|vesham|and there|2|miketz-raw
אִתָּנוּ|itanu|with us|2|miketz-raw
נַעַר|naar|youth,lad|2|miketz-raw
עִבְרִי|ivri|Hebrew|2|miketz-raw
עֶבֶד|eved|servant,slave|2|miketz-raw
לְשַׂר|lesar|to the chief of|2|miketz-raw
וַנְּסַפֶּר|vanesaper|and we told|3|miketz-raw
לוֹ|lo|to him|1|miketz-raw
וַיִּפְתָּר|vayiftar|and he interpreted|3|miketz-raw
לָנוּ|lanu|to us|2|miketz-raw
חֲלֹמֹתֵינוּ|chalomoteinu|our dreams|3|miketz-raw
כַּחֲלֹמוֹ|kachalomo|according to his dream|3|miketz-raw
פָּתַר|patar|interpreted|2|miketz-raw
כַּאֲשֶׁר|kaasher|just as,when|2|miketz-raw
הָיָה|hayah|it was,happened|2|miketz-raw
הֵשִׁיב|heshiv|restored,returned|2|miketz-raw
כַּנִּי|kani|my post,my position|3|miketz-raw
וְאֹתוֹ|veoto|and him|2|miketz-raw
תָלָה|talah|hanged|2|miketz-raw
יוֹסֵף|yosef|Joseph|2|miketz-raw
וַיְרִיצֻהוּ|vayritzuhu|and they rushed him|3|miketz-raw
הַבּוֹר|habor|the pit,the dungeon|2|miketz-raw
וַיְגַלַּח|vayegalach|and he shaved|3|miketz-raw
וַיְחַלֵּף|vayechalef|and he changed|3|miketz-raw
שִׂמְלֹתָיו|simlotav|his clothes,his garments|3|miketz-raw
וַיָּבֹא|vayavo|and he came|2|miketz-raw
אֶל|el|to,toward|1|miketz-raw
`.trim().split("\n").filter(Boolean);

function parseRow(line) {
  const [hebrew, translit, englishPart, difficulty, level] = line.split("|");
  const trimmedLevel = level.trim();
  const numericLevel = Number(trimmedLevel);
  return {
    hebrew: hebrew.trim(),
    translit: translit.trim(),
    english: englishPart.split(",").map((s) => s.trim()),
    difficulty: Number(difficulty),
    level: Number.isFinite(numericLevel) && /^\d+$/.test(trimmedLevel)
      ? numericLevel
      : trimmedLevel,
  };
}

const MAX_PER_LEVEL = 25;

/**
 * Auto-split level groups that have more than MAX_PER_LEVEL words.
 *
 * - A level with N <= MAX words keeps its original id.
 * - A level with N > MAX is divided into ceil(N / MAX) chunks of nearly-equal
 *   size, and each chunk gets a stable letter suffix (`a`, `b`, `c`, ...).
 *   `10` (30 words) → `10a` (15) + `10b` (15)
 *   `miketz-1` (59 words) → `miketz-1-a`, `miketz-1-b`, `miketz-1-c`
 *
 * Word order within a level is preserved so suffix mapping is deterministic.
 */
function splitOversizedLevels(entries) {
  const groups = new Map();
  for (const e of entries) {
    const key = String(e.level);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  const out = [];
  for (const [originalLevel, list] of groups) {
    if (list.length <= MAX_PER_LEVEL) {
      out.push(...list);
      continue;
    }
    const parts = Math.ceil(list.length / MAX_PER_LEVEL);
    const baseSize = Math.floor(list.length / parts);
    const remainder = list.length % parts;
    let cursor = 0;
    const isNumeric = /^\d+$/.test(originalLevel);
    for (let i = 0; i < parts; i++) {
      const size = baseSize + (i < remainder ? 1 : 0);
      const slice = list.slice(cursor, cursor + size);
      cursor += size;
      const suffix = String.fromCharCode("a".charCodeAt(0) + i);
      const newLevel = isNumeric
        ? `${originalLevel}${suffix}`
        : `${originalLevel}-${suffix}`;
      for (const w of slice) {
        out.push({ ...w, level: newLevel });
      }
    }
  }
  return out;
}

const MIKETZ_1_TEXT = `
טזוַיַּ֨רְא יוֹסֵ֣ף אִתָּם֘ אֶת־בִּנְיָמִין֒ וַיֹּ֨אמֶר֙ לַֽאֲשֶׁ֣ר עַל־בֵּית֔וֹ הָבֵ֥א אֶת־הָֽאֲנָשִׁ֖ים הַבָּ֑יְתָה וּטְבֹ֤חַ טֶ֨בַח֙ וְהָכֵ֔ן כִּ֥י אִתִּ֛י יֹֽאכְל֥וּ הָֽאֲנָשִׁ֖ים בַּצָּֽהֳרָֽיִם:
יזוַיַּ֣עַשׂ הָאִ֔ישׁ כַּֽאֲשֶׁ֖ר אָמַ֣ר יוֹסֵ֑ף וַיָּבֵ֥א הָאִ֛ישׁ אֶת־הָֽאֲנָשִׁ֖ים בֵּ֥יתָה יוֹסֵֽף:
יחוַיִּֽירְא֣וּ הָֽאֲנָשִׁ֗ים כִּ֣י הֽוּבְאוּ֘ בֵּ֣ית יוֹסֵף֒ וַיֹּֽאמְר֗וּ עַל־דְּבַ֤ר הַכֶּ֨סֶף֙ הַשָּׁ֤ב בְּאַמְתְּחֹתֵ֨ינוּ֙ בַּתְּחִלָּ֔ה אֲנַ֖חְנוּ מֽוּבָאִ֑ים לְהִתְגֹּלֵ֤ל עָלֵ֨ינוּ֙ וּלְהִתְנַפֵּ֣ל עָלֵ֔ינוּ וְלָקַ֧חַת אֹתָ֛נוּ לַֽעֲבָדִ֖ים וְאֶת־חֲמֹרֵֽינוּ:
`;

const MIKETZ_7_TEXT = `
וַיְמַֽהֲר֗וּ וַיּוֹרִ֛דוּ אִ֥ישׁ אֶת־אַמְתַּחְתּ֖וֹ אָ֑רְצָה וַיִּפְתְּח֖וּ אִ֥ישׁ אַמְתַּחְתּֽוֹ:
יבוַיְחַפֵּ֕שׂ בַּגָּד֣וֹל הֵחֵ֔ל וּבַקָּטֹ֖ן כִּלָּ֑ה וַיִּמָּצֵא֙ הַגָּבִ֔יעַ בְּאַמְתַּ֖חַת בִּנְיָמִֽן:
יגוַיִּקְרְע֖וּ שִׂמְלֹתָ֑ם וַיַּֽעֲמֹס֙ אִ֣ישׁ עַל־חֲמֹר֔וֹ וַיָּשֻׁ֖בוּ הָעִֽירָה:
ידוַיָּבֹ֨א יְהוּדָ֤ה וְאֶחָיו֙ בֵּ֣יתָה יוֹסֵ֔ף וְה֖וּא עוֹדֶ֣נּוּ שָׁ֑ם וַיִּפְּל֥וּ לְפָנָ֖יו אָֽרְצָה:
טווַיֹּ֤אמֶר לָהֶם֙ יוֹסֵ֔ף מָֽה־הַמַּֽעֲשֶׂ֥ה הַזֶּ֖ה אֲשֶׁ֣ר עֲשִׂיתֶ֑ם הֲל֣וֹא יְדַעְתֶּ֔ם כִּֽי־נַחֵ֧שׁ יְנַחֵ֛שׁ אִ֖ישׁ אֲשֶׁ֥ר כָּמֹֽנִי:
טזוַיֹּ֣אמֶר יְהוּדָ֗ה מַה־נֹּאמַר֙ לַֽאדֹנִ֔י מַה־נְּדַבֵּ֖ר וּמַה־נִּצְטַדָּ֑ק הָֽאֱלֹהִ֗ים מָצָא֙ אֶת־עֲוֹ֣ן עֲבָדֶ֔יךָ הִנֶּנּ֤וּ עֲבָדִים֙ לַֽאדֹנִ֔י גַּם־אֲנַ֕חְנוּ גַּ֛ם אֲשֶׁר־נִמְצָ֥א הַגָּבִ֖יעַ בְּיָדֽוֹ:
יזוַיֹּ֕אמֶר חָלִ֣ילָה לִּ֔י מֵֽעֲשׂ֖וֹת זֹ֑את הָאִ֡ישׁ אֲשֶׁר֩ נִמְצָ֨א הַגָּבִ֜יעַ בְּיָד֗וֹ ה֚וּא יִֽהְיֶה־לִּ֣י עָ֔בֶד וְאַתֶּ֕ם עֲל֥וּ לְשָׁל֖וֹם אֶל־אֲבִיכֶֽם:
`;

function removeVersePrefix(line) {
  return line.replace(/^[א-ת]{1,2}(?=ו)/, "");
}

function cleanHebrewToken(token) {
  return token.replace(/[^\u0590-\u05FF]/g, "");
}

function transliterateHebrew(hebrew) {
  const plain = hebrew.normalize("NFD").replace(/[\u0591-\u05C7]/g, "");
  const map = {
    א: "a",
    ב: "b",
    ג: "g",
    ד: "d",
    ה: "h",
    ו: "v",
    ז: "z",
    ח: "ch",
    ט: "t",
    י: "y",
    כ: "k",
    ך: "k",
    ל: "l",
    מ: "m",
    ם: "m",
    נ: "n",
    ן: "n",
    ס: "s",
    ע: "a",
    פ: "p",
    ף: "f",
    צ: "tz",
    ץ: "tz",
    ק: "k",
    ר: "r",
    ש: "sh",
    ת: "t",
  };
  let out = "";
  for (const ch of plain) out += map[ch] ?? "";
  return out || "he";
}

function inferDifficulty(hebrew) {
  const letters = hebrew.replace(/[\u0591-\u05C7]/g, "").length;
  if (letters <= 3) return 1;
  if (letters <= 5) return 2;
  return 3;
}

function extractUniqueWords(text) {
  const seen = new Set();
  const out = [];
  const lines = text
    .split("\n")
    .map((l) => removeVersePrefix(l.trim()))
    .filter(Boolean);
  for (const line of lines) {
    const normalized = line.replace(/[:׃]/g, " ").replace(/־/g, " ");
    for (const raw of normalized.split(/\s+/)) {
      const token = cleanHebrewToken(raw);
      if (!token || seen.has(token)) continue;
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

function buildMiketzRows() {
  const group1 = extractUniqueWords(MIKETZ_1_TEXT).map((hebrew) => ({
    hebrew,
    translit: transliterateHebrew(hebrew),
    english: ["Miketz 1"],
    difficulty: inferDifficulty(hebrew),
    level: "miketz-1",
  }));
  const group7 = extractUniqueWords(MIKETZ_7_TEXT).map((hebrew) => ({
    hebrew,
    translit: transliterateHebrew(hebrew),
    english: ["Miketz 7"],
    difficulty: inferDifficulty(hebrew),
    level: "miketz-7",
  }));
  return [...group1, ...group7];
}

const rawWords = rows.map(parseRow);
const baseWords = rawWords.filter((w) => String(w.level) !== "miketz-raw");
const words = splitOversizedLevels([...baseWords, ...buildMiketzRows()]);

const counts = words.reduce((acc, w) => {
  const k = String(w.level);
  acc[k] = (acc[k] ?? 0) + 1;
  return acc;
}, {});
const tooBig = Object.entries(counts).filter(([, n]) => n > MAX_PER_LEVEL);
if (tooBig.length > 0) {
  throw new Error(
    `Levels still exceed MAX_PER_LEVEL=${MAX_PER_LEVEL}: ${tooBig
      .map(([k, n]) => `${k}=${n}`)
      .join(", ")}`,
  );
}

const outPath = join(root, "data", "words.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(words, null, 2), "utf8");
console.log(
  `Wrote ${words.length} words across ${Object.keys(counts).length} level groups to ${outPath}`,
);
