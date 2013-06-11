"use strict";

var SoftForum = function (html, smime_header, smime_body, info_msg, ui_option, ui_desc) {
    this.html = html || '';
    this.smime_header = this.peel(smime_header, true);
    this.smime_body = this.peel(smime_body);
    this.info_msg = this.peel(info_msg, true);
    this.ui_option = ui_option || '';
    this.ui_desc = ui_desc || '';
};

SoftForum.prototype = new Vendor('XecureExpress');
extend(SoftForum.prototype, {
    init: function () {
        var contentType = this.smime_header.match(/Content-Type: \s*([\w-\/]+);*/i)[1];
        if (contentType === 'application/pkcs7-mime') {
            this.decrypt = function (password) {
                return this.decryptSMIME(this.smime_body, password);
            };
        } else if (contentType === 'application/x-pwd') {
            var match = this.smime_header.match(/X-XE_KEY: \s*([\d]+): \s*([\w+\/=]+);*/i),
                kind = parseInt(match[1]),
                key = match[2];
            this.decrypt = function (password) {
                return this.decryptPWD(kind, key, this.smime_body, password);
            };
        }

        //HACK: 구분자가 '보안메일'로 동일한 발송기관 강제 구분.
        var company = this.ui_desc;
        if (company === '보안메일' || company === 'ｺｸｾﾈｸﾞﾀﾏ' || company === '���ȸ���') {
            if (this.info_msg.indexOf('hanabank') > -1) {
                company = 'Xeit.hanabank';
            } else if (this.html.indexOf('kbcard') > -1) {
                company = 'Xeit.kbcard';
            } else if (/(?=.*lottecard)(?=.*point)/.test(this.smime_header)) {
                company = 'Xeit.lottepoint';
            } else if (this.html.indexOf('samsungcard.co.kr') > -1) {
                company = 'Xeit.samsungcard';
            } else if (this.html.indexOf('uplus.co.kr') > -1) {
                company = 'Xeit.uplus';
            } else if (this.info_msg.indexOf('KEB') > -1) {
                company = 'Xeit.yescard';
            }
        } else if (company === '悼剧积疙 焊救皋老') {
            company = '동양생명 보안메일';
        }

        this.recognize(company, {
            name: company
        });
    },

    supported_senders: {
        'HyundaiCard': {
            name: '현대카드',
            support: true,
            hint: '주민등록번호 뒤',
            keylen: 7
        },

        'LG카드 보안메일': {
            name: '신한카드 (구 LG카드)',
            support: true,
            hint: '주민등록번호 뒤',
            keylen: 7
        },

        'SAMSUNG LIFE': {
            name: '삼성생명',
            support: true,
            hint: '주민등록번호 뒤',
            keylen: 7
        },

        'TRUEFRIEND': {
            name: '한국투자증권',
            support: true,
            hint: '주민등록번호 뒤',
            keylen: 7
        },

        'Xeit.hanabank': {
            name: '하나은행',
            support: true,
            hint: '주민등록번호 뒤',
            keylen: 7
        },

        'Xeit.kbcard': {
            name: 'KB국민카드',
            support: true,
            hint: '주민등록번호 뒤',
            keylen: 7
        },

        'Xeit.lottepoint': {
            name: '롯데포인트카드',
            support: true,
            hint: '주민등록번호 뒤',
            keylen: 7
        },

        'Xeit.samsungcard': {
            name: '삼성카드',
            support: false,
            hint: '-'
        },

        'Xeit.uplus': {
            name: 'LG유플러스',
            support: true,
            hint: '주민등록번호 뒤',
            keylen: 7
        },

        'Xeit.yescard': {
            name: '외환카드',
            support: true,
            hint: '주민등록번호 뒤',
            keylen: 7
        },

        '동양생명 보안메일': {
            name: '동양생명',
            support: true,
            hint: '주민등록번호 뒤',
            keylen: 7
        },

        '신한카드 보안메일': {
            name: '신한카드',
            support: true,
            hint: '주민등록번호 뒤',
            keylen: 7
        }
    },

    supported_fixers: {
        'Xeit.yescard': {
            fix_message: function (message) {
                return message.replace(/href="#topmove"/g, '');
            }
        }
    },

    decryptSMIME: function (envelope, password) {
        var ciphers = {
            desCBC: CryptoJS.DES,   // 1.3.14.3.2.7,
            seedCBC: CryptoJS.SEED  // 1.2.410.200004.1.4
        };

        ASN1.prototype.contentRaw = function () {
            var offset = this.posContent(),
                length = this.length;
            return this.stream.parseStringISO(offset, offset + length);
        };

        var der = Base64.unarmor(envelope),
            asn1 = ASN1.decode(der),
            envelopedData = asn1.sub[1].sub[0];

        // 주민등록번호로 암호화된 대칭키 복호화.
        var recipientInfos = envelopedData.sub[1],
            keyTransportRecipientInfo = recipientInfos.sub[0],
            keyEncryptionAlgorithm = oids[keyTransportRecipientInfo.sub[2].sub[0].content()].d;
        var encryptedKey = CryptoJS.enc.Latin1.parse(keyTransportRecipientInfo.sub[3].contentRaw()),
            passwordKey = CryptoJS.SHA1(password),
            iv = CryptoJS.enc.Hex.parse("0");
        var decryptedKey = ciphers[keyEncryptionAlgorithm].decrypt(
            { ciphertext: encryptedKey },
            passwordKey,
            { iv: iv }
        );

        this.verify(decryptedKey);

        // 대칭키로 암호화된 메일 본문 복호화.
        var encryptedContentInfo = envelopedData.sub[2],
            contentEncryptionAlgorithm = oids[encryptedContentInfo.sub[1].sub[0].content()].d,
            encryptedContent = CryptoJS.enc.Latin1.parse(encryptedContentInfo.sub[2].contentRaw());
        var decryptedContent = ciphers[contentEncryptionAlgorithm].decrypt(
            { ciphertext: encryptedContent },
            decryptedKey,
            { iv: iv }
        );
        return decryptedContent;
    },

    decryptPWD: function (kind, key, content, password) {
        var ciphers = {
            0: CryptoJS.DES,
            10: CryptoJS.SEED
        };

        var encryptedKey = CryptoJS.enc.Base64.parse(key),
            passwordKey = CryptoJS.SHA1(password),
            iv = CryptoJS.enc.Hex.parse("0");
        var decryptedKey = ciphers[kind].decrypt(
            { ciphertext: encryptedKey },
            passwordKey,
            { iv: iv }
        );

        this.verify(decryptedKey);

        var encryptedContent = CryptoJS.enc.Base64.parse(content);
        var decryptedContent = ciphers[kind].decrypt(
            { ciphertext: encryptedContent },
            decryptedKey,
            { iv: iv }
        );
        return decryptedContent;
    },

    verify: function (content) {
        function value(index) {
            return content.words[index >>> 2] >>> ((3 - index % 4) * 8) & 0xff;
        }

        var last = content.words.length * 4 - 1;
        if (last > 0) {
            var length = value(last);
            if (0x01 <= length && length <= 0x10) {
                var pads = [];
                for (var i = 0; i < length; i++) {
                    pads.push(value(last - i));
                }
                if (pads.every(function (element, index, array) {
                    return (element == length);
                })) {
                    return;
                }
            }
        }

        // PKCS#5/#7 padding이 잘못 되어 있으면 비밀번호 오류로 간주.
        throw Error('다시 입력해보세요!');
    },

    render_message: function (message) {
        //HACK: 남아 있는 email header 제거하여 HTML 시작 직전까지 잘라냄.
        var offset = /(<!DOCTYPE|<html|<head|<body)/i.exec(message);
        return (offset) ? message.slice(offset.index) : message;
    }
});
