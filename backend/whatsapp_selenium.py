from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
import time
import os
import sys

# Global driver session
driver = None

def get_driver():
    global driver
    
    # Check if driver is already running and responsive
    if driver is not None:
        try:
            _ = driver.current_url
        except Exception:
            print("Chrome window closed or lost connection. Resetting driver...", flush=True)
            try:
                driver.quit()
            except Exception:
                pass
            driver = None

    if driver is None:
        print("Launching persistent Chrome browser via Selenium...", flush=True)
        try:
            options = Options()
            
            # Use a persistent user-data directory to save WhatsApp QR scans
            session_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "whatsapp_session"))
            options.add_argument(f"--user-data-dir={session_dir}")
            options.add_argument("--profile-directory=Default")
            
            # Anti-detection, first-run bypass & performance flags
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--disable-gpu")
            options.add_argument("--start-maximized")
            options.add_argument("--no-default-browser-check")
            options.add_argument("--no-first-run")
            options.add_argument("--disable-default-apps")
            options.add_argument("--disable-popup-blocking")
            options.add_argument("--disable-extensions")
            
            # Use system Chrome to avoid ChromeDriver crashes with Chrome for Testing on macOS
            options.binary_location = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            
            # Selenium 4.6+ built-in SeleniumManager
            driver = webdriver.Chrome(options=options)
            driver.set_page_load_timeout(35)
            print("Chrome launched successfully.", flush=True)
        except Exception as e:
            print(f"Error launching Chrome: {str(e)}", flush=True)
            raise e
            
    return driver

def find_element_with_fallbacks(d, selectors, timeout=10, name="element"):
    end_time = time.time() + timeout
    last_err = None
    
    print(f"[SELENIUM] Polling for {name} using JS evaluation to prevent ChromeDriver crashes...", flush=True)
    while time.time() < end_time:
        for selector_type, selector_val in selectors:
            try:
                # Use JS to avoid ChromeDriver native selector crashes
                if selector_type == By.CSS_SELECTOR:
                    # Escape quotes in selector_val
                    escaped_val = selector_val.replace("'", "\\'")
                    element = d.execute_script(f"return document.querySelector('{escaped_val}');")
                elif selector_type == By.XPATH:
                    # Escape quotes in selector_val
                    escaped_val = selector_val.replace("'", "\\'")
                    script = f"""
                        var result = document.evaluate('{escaped_val}', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                        return result.singleNodeValue;
                    """
                    element = d.execute_script(script)
                else:
                    # Fallback for ID, CLASS_NAME etc if ever used
                    element = d.find_element(selector_type, selector_val)
                    
                if element is not None:
                    print(f"[SELENIUM] Found {name}!", flush=True)
                    return element
            except Exception as e:
                last_err = e
                pass
        time.sleep(0.5)
        
    try:
        html = d.page_source
        with open("whatsapp_debug.html", "w", encoding="utf-8") as f:
            f.write(html)
    except:
        pass
    raise last_err if last_err else Exception(f"Unable to find {name} with any fallback selectors")

def click_element(d, element):
    try:
        element.click()
        print("[SELENIUM] Clicked element successfully.", flush=True)
    except Exception as e:
        print(f"[SELENIUM] Standard click failed ({str(e)}), attempting JS click fallback...", flush=True)
        d.execute_script("arguments[0].click();", element)
        print("[SELENIUM] JS click completed.", flush=True)

def send_message(contact: str, message: str) -> str:
    """
    Sends a WhatsApp message using Selenium browser automation.
    If browser is already open, reuses session instantly.
    """
    try:
        d = get_driver()
    except Exception as e:
        return f"Failed to initialize Chrome browser, Sir. Error: {str(e)}"
        
    try:
        # STEP 2 — Open WhatsApp Web if not already there
        if "web.whatsapp.com" not in d.current_url:
            print("Opening WhatsApp Web...", flush=True)
            try:
                d.get("https://web.whatsapp.com")
            except Exception as e:
                # Page load might time out due to eager strategy, check if it loaded anyway
                print(f"[SELENIUM] Warning during page load: {str(e)}", flush=True)
            
        print("Waiting for WhatsApp Web to load chats list...", flush=True)
        try:
            # Wait up to 60 seconds for the chat list list items to appear
            WebDriverWait(d, 60).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "div[aria-label='Chat list']"))
            )
            print("Chats list loaded successfully.", flush=True)
        except Exception:
            # If wait timed out, it usually means the user has not scanned the QR code
            return "Please scan the QR code first, Sir. I have opened WhatsApp Web for you to scan."

        # STEP 3 — Search for contact by name
        print(f"Searching for contact: '{contact}'...", flush=True)
        
        search_selectors = [
            (By.CSS_SELECTOR, 'input[aria-label="Search or start a new chat"]'),
            (By.CSS_SELECTOR, 'input[data-tab="3"]'),
            (By.CSS_SELECTOR, 'input[title="Search input textbox"]'),
            (By.XPATH, '//div[@data-testid="chat-list-search"]'),
            (By.CSS_SELECTOR, 'div[contenteditable="true"][data-tab="3"]'),
            (By.CSS_SELECTOR, '#side div[contenteditable="true"]')
        ]
        
        try:
            search_box = find_element_with_fallbacks(d, search_selectors, timeout=10, name="Search Box")
            click_element(d, search_box)
            time.sleep(0.5)
            
            # Clear previous search text using key combinations
            search_box.send_keys(Keys.COMMAND + "a")
            search_box.send_keys(Keys.CONTROL + "a")
            search_box.send_keys(Keys.BACKSPACE)
            time.sleep(0.5)
            
            # Type contact name
            search_box.send_keys(contact)
            print("Contact name entered. Waiting for search results to filter...", flush=True)
            time.sleep(3.0) # Wait 3 seconds for search results to filter
        except Exception as e:
            return f"Failed to locate or type in WhatsApp search field, Sir. Error: {str(e)}"

        # STEP 4 — Click the first search result
        print("Locating search result...", flush=True)
        
        # Translate title to lowercase for case-insensitivity
        result_selectors = [
            (By.XPATH, f'//span[contains(translate(@title, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "{contact.lower()}")]'),
            (By.XPATH, '//div[@aria-label="Search results."]//div[@role="listitem"][1]'),
            (By.XPATH, '//div[@id="pane-side"]//div[@role="listitem"][1]'),
            (By.XPATH, '//div[@role="listitem"]'),
            (By.CSS_SELECTOR, 'div[role="listitem"]')
        ]
        
        try:
            first_result = find_element_with_fallbacks(d, result_selectors, timeout=5, name="Search Result Item")
            click_element(d, first_result)
            print("Opened chat conversation.", flush=True)
            time.sleep(1.5) # Wait for chat panel to load fully
        except Exception as e:
            return f"I couldn't find '{contact}' in WhatsApp, Sir. Error: {str(e)}"

        # STEP 5 — Type and send message
        print(f"Sending message content to '{contact}'...", flush=True)
        
        message_selectors = [
            (By.XPATH, '//div[@contenteditable="true"][@data-testid="conversation-text-input"]'),
            (By.XPATH, '//div[@contenteditable="true"][@data-tab="10"]'),
            (By.CSS_SELECTOR, 'div[title="Type a message"]'),
            (By.CSS_SELECTOR, 'footer div[contenteditable="true"]'),
            (By.CSS_SELECTOR, 'footer div[role="textbox"]')
        ]
        
        try:
            message_box = find_element_with_fallbacks(d, message_selectors, timeout=10, name="Message Input Box")
            click_element(d, message_box)
            time.sleep(0.5)
            
            message_box.send_keys(message)
            time.sleep(0.5)
            message_box.send_keys(Keys.ENTER)
            print("Message sent successfully.", flush=True)
            time.sleep(1.0) # Wait 1 second to confirm transmission
        except Exception as e:
            return f"Failed to locate message entry box, Sir. Error: {str(e)}"

        return f"Message sent to {contact}, Sir."
        
    except Exception as e:
        return f"WhatsApp automation encountered an unexpected fault, Sir. Error: {str(e)}"

def make_call(contact: str, call_type: str = "voice") -> str:
    """
    Makes a WhatsApp voice or video call using Selenium browser automation.
    """
    try:
        d = get_driver()
    except Exception as e:
        return f"Failed to initialize Chrome browser, Sir. Error: {str(e)}"
        
    try:
        # STEP 2 — Open WhatsApp Web if not already there
        if "web.whatsapp.com" not in d.current_url:
            print("Opening WhatsApp Web...", flush=True)
            try:
                d.get("https://web.whatsapp.com")
            except Exception as e:
                print(f"[SELENIUM] Warning during page load: {str(e)}", flush=True)
            
        print("Waiting for WhatsApp Web to load chats list...", flush=True)
        try:
            WebDriverWait(d, 60).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "div[aria-label='Chat list']"))
            )
            print("Chats list loaded successfully.", flush=True)
        except Exception:
            return "Please scan the QR code first, Sir. I have opened WhatsApp Web for you to scan."

        # STEP 3 — Search for contact by name
        print(f"Searching for contact: '{contact}'...", flush=True)
        
        search_selectors = [
            (By.CSS_SELECTOR, 'input[aria-label="Search or start a new chat"]'),
            (By.CSS_SELECTOR, 'input[data-tab="3"]'),
            (By.CSS_SELECTOR, 'input[title="Search input textbox"]'),
            (By.XPATH, '//div[@data-testid="chat-list-search"]'),
            (By.CSS_SELECTOR, 'div[contenteditable="true"][data-tab="3"]'),
            (By.CSS_SELECTOR, '#side div[contenteditable="true"]')
        ]
        
        try:
            search_box = find_element_with_fallbacks(d, search_selectors, timeout=10, name="Search Box")
            click_element(d, search_box)
            time.sleep(0.5)
            search_box.send_keys(Keys.COMMAND + "a")
            search_box.send_keys(Keys.CONTROL + "a")
            search_box.send_keys(Keys.BACKSPACE)
            time.sleep(0.5)
            search_box.send_keys(contact)
            time.sleep(3.0) 
        except Exception as e:
            return f"Failed to locate or type in WhatsApp search field, Sir. Error: {str(e)}"

        # STEP 4 — Click the first search result
        print("Locating search result...", flush=True)
        result_selectors = [
            (By.XPATH, f'//span[contains(translate(@title, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "{contact.lower()}")]'),
            (By.XPATH, '//div[@aria-label="Search results."]//div[@role="listitem"][1]'),
            (By.XPATH, '//div[@id="pane-side"]//div[@role="listitem"][1]'),
            (By.XPATH, '//div[@role="listitem"]'),
            (By.CSS_SELECTOR, 'div[role="listitem"]')
        ]
        try:
            first_result = find_element_with_fallbacks(d, result_selectors, timeout=5, name="Search Result Item")
            click_element(d, first_result)
            print("Opened chat conversation.", flush=True)
            time.sleep(1.5)
        except Exception as e:
            return f"I couldn't find '{contact}' in WhatsApp, Sir. Error: {str(e)}"

        # STEP 5 — Click the call button
        print(f"Initiating {call_type} call to '{contact}'...", flush=True)
        
        if call_type.lower() == "video":
            call_selectors = [
                (By.CSS_SELECTOR, 'div[title="Video call"]'),
                (By.CSS_SELECTOR, 'span[data-icon="video-call"]'),
                (By.CSS_SELECTOR, 'button[aria-label="Video call"]')
            ]
        else:
            call_selectors = [
                (By.CSS_SELECTOR, 'div[title="Voice call"]'),
                (By.CSS_SELECTOR, 'span[data-icon="audio-call"]'),
                (By.CSS_SELECTOR, 'button[aria-label="Voice call"]')
            ]
            
        try:
            call_button = find_element_with_fallbacks(d, call_selectors, timeout=10, name="Call Button")
            click_element(d, call_button)
            print(f"{call_type.capitalize()} call started.", flush=True)
            time.sleep(1.0)
        except Exception as e:
            return f"Failed to initiate {call_type} call, Sir. The contact might not support web calling, or the button is hidden. Error: {str(e)}"

        return f"Initiated a {call_type} call to {contact}, Sir."
        
    except Exception as e:
        return f"WhatsApp calling automation encountered an unexpected fault, Sir. Error: {str(e)}"
