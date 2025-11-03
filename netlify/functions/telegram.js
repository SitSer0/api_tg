// ============================================
// TELEGRAM BOT API - NETLIFY FUNCTION
// ============================================
// Этот файл для использования на Netlify
// Разместите его в папке: netlify/functions/telegram.js
// ============================================

/**
 * Netlify Function Handler
 */
exports.handler = async (event, context) => {
    // Проверяем метод запроса
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({
                success: false,
                error: 'Method not allowed. Use POST.'
            })
        };
    }

    try {
        // Парсим тело запроса
        const body = JSON.parse(event.body);
        const { name, email, company, message } = body;

        // Валидация обязательных полей
        if (!name || !email || !message) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: 'Missing required fields: name, email, message'
                })
            };
        }

        // Валидация email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: 'Invalid email format'
                })
            };
        }

        // Получаем токен бота, Chat ID и Topic ID из переменных окружения
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
        const TOPIC_ID = process.env.TELEGRAM_TOPIC_ID; // ID топика (опционально)

        // Проверка наличия конфигурации
        if (!BOT_TOKEN || !CHAT_ID) {
            console.error('Telegram configuration missing');
            return {
                statusCode: 500,
                body: JSON.stringify({
                    success: false,
                    error: 'Telegram bot not configured'
                })
            };
        }

        // Преобразуем Topic ID в число, если указан (опционально)
        let topicIdNum = null;
        if (TOPIC_ID) {
            topicIdNum = Number(TOPIC_ID);
            if (isNaN(topicIdNum)) {
                console.warn('Invalid TOPIC_ID format, will send to general chat');
                topicIdNum = null;
            }
        }

        // Формируем структурированное сообщение
        const telegramMessage = formatTelegramMessage(name, email, company, message);

        // Отправляем сообщение в Telegram
        const telegramResponse = await sendTelegramMessage(BOT_TOKEN, CHAT_ID, telegramMessage, topicIdNum);

        // Проверяем успешность отправки
        if (telegramResponse.ok) {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    message: 'Telegram notification sent successfully',
                    messageId: telegramResponse.result.message_id
                })
            };
        } else {
            throw new Error(`Telegram API error: ${telegramResponse.description || 'Unknown error'}`);
        }

    } catch (error) {
        console.error('Error sending Telegram notification:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: 'Failed to send Telegram notification',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            })
        };
    }
};

/**
 * Форматирует сообщение для Telegram
 */
function formatTelegramMessage(name, email, company, message) {
    const now = new Date();
    const dateTime = now.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    let formattedMessage = `🎯 <b>Новая заявка с сайта Кассиопея AI</b>\n\n`;
    formattedMessage += `👤 <b>Имя:</b> ${escapeHtml(name)}\n`;
    formattedMessage += `📧 <b>Email:</b> ${escapeHtml(email)}\n`;
    
    if (company && company.trim()) {
        formattedMessage += `🏢 <b>Компания:</b> ${escapeHtml(company)}\n`;
    }
    
    formattedMessage += `\n💬 <b>Сообщение:</b>\n${escapeHtml(message)}\n\n`;
    formattedMessage += `📅 <b>Отправлено:</b> ${dateTime}`;

    return formattedMessage;
}

/**
 * Отправляет сообщение в Telegram через Bot API
 * @param {string} botToken - Токен бота
 * @param {string|number} chatId - ID чата/группы
 * @param {string} text - Текст сообщения
 * @param {number|null} topicId - ID топика (опционально, для форумов)
 */
async function sendTelegramMessage(botToken, chatId, text, topicId = null) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    const requestBody = {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    };

    // Если указан Topic ID, добавляем его в запрос (для форумов)
    if (topicId !== null && !isNaN(topicId)) {
        requestBody.message_thread_id = topicId;
    }
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
    });

    return await response.json();
}

/**
 * Экранирует HTML-символы для безопасности
 */
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

