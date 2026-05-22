import { trackEvent } from './analytics.js';

const GUIDE_RESPONSES = [
    {
        terms: ['karst', 'cave', 'groundwater', 'risk'],
        text: 'The main site risk is karst and groundwater uncertainty. Treat mapped karst, vulnerability, aquifer, and source-protection layers as screening evidence, then confirm with GPR/services checks and site investigation before drilling.',
    },
    {
        terms: ['geothermal', 'gshp', 'heat', 'borehole', 'drilling'],
        text: 'The viewer is set up for closed-loop geothermal screening: interpreted formation stack, proposed BHE layout, geothermal overlays, and a virtual drilling/prognosis workflow. It is decision support, not a certified design model.',
    },
    {
        terms: ['trust', 'source', 'provenance', 'confidence', 'lineage'],
        text: 'Use the provenance and ontology panels to separate official processed layers from interpreted model outputs and design assumptions. Confidence labels are part of the product, not decoration.',
    },
    {
        terms: ['how', 'use', 'start', 'workflow'],
        text: 'A useful flow is: apply Drilling Risk view, inspect mapped features, open Provenance for caveats, then use Assessment or Prognosis to summarize what is known and what still needs field confirmation.',
    },
];

function guideResponse(text) {
    const normalized = text.toLowerCase();
    const match = GUIDE_RESPONSES.find((item) => item.terms.some((term) => normalized.includes(term)));
    if (match) return match.text;
    return 'This static portfolio version focuses on the 3D viewer, overlays, provenance, assessment, and prognosis workflows. For value: inspect the drilling-risk preset, source confidence labels, and evidence caveats before treating any interpreted layer as decision support.';
}

export function initChat() {
    const panel = document.getElementById('chat-panel');
    const toggle = document.getElementById('chat-toggle');
    const closeBtn = document.getElementById('chat-close');
    const messages = document.getElementById('chat-messages');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');
    const statusEl = document.getElementById('chat-status');

    let isOpen = false;

    statusEl.textContent = 'static guide';
    statusEl.className = 'chat-status connected';
    sendBtn.disabled = false;
    input.placeholder = 'Ask about using this static model...';

    if (!messages.querySelector('.chat-msg')) {
        addMessage('assistant', 'Static model guide ready. Ask about drilling risk, geothermal screening, provenance, or how to read the viewer caveats.');
    }

    toggle.addEventListener('click', () => {
        isOpen = !isOpen;
        panel.classList.toggle('open', isOpen);
        if (isOpen) input.focus();
        trackEvent(isOpen ? 'chat_opened' : 'chat_closed');
        trackEvent(isOpen ? 'panel_opened' : 'panel_closed', { panel_name: 'chat' });
    });

    closeBtn.addEventListener('click', () => {
        closeChat();
    });

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (
            event.key === 'Enter'
            && !isOpen
            && event.target.tagName !== 'INPUT'
            && event.target.tagName !== 'TEXTAREA'
        ) {
            event.preventDefault();
            isOpen = true;
            panel.classList.add('open');
            input.focus();
            trackEvent('chat_opened');
            trackEvent('panel_opened', { panel_name: 'chat' });
        }
        if (event.key === 'Escape' && isOpen) {
            closeChat();
        }
    });

    function closeChat() {
        isOpen = false;
        panel.classList.remove('open');
        trackEvent('chat_closed');
        trackEvent('panel_closed', { panel_name: 'chat' });
    }

    function sendMessage() {
        const text = input.value.trim();
        if (!text) return;
        trackEvent('chat_message_sent', { message_length: text.length, word_count: text.split(/\s+/).length, mode: 'static' });
        addMessage('user', text);
        addMessage('assistant', guideResponse(text));
        input.value = '';
        input.style.height = 'auto';
    }

    function addMessage(role, text) {
        const msg = document.createElement('div');
        msg.className = 'chat-msg ' + role;
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        bubble.textContent = text;
        msg.appendChild(bubble);
        messages.appendChild(msg);
        messages.scrollTop = messages.scrollHeight;
        return msg;
    }
}
