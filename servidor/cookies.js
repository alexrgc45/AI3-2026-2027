export function lerCookie(req, nome) {
    const cabecalhoCookies = req.get('Cookie');
    
    if (!cabecalhoCookies) {
        return null;
    }

    const cookies = cabecalhoCookies.split(';');
    
    for (const cookie of cookies) {
        const [chave, valor] = cookie.trim().split('=');
        
        if (chave === nome) {
            return valor;
        }
    }
    
    return null;
}