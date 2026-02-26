package com.apiHelper;

import com.apiHelper.server.EmbeddedWebServer;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.project.ProjectManager;
import com.intellij.ui.jcef.JBCefBrowser;

import javax.swing.*;
import java.awt.*;


public class YamlDocsToolWindow {
    private final JPanel mainPanel;
    private final Project project;
    private final EmbeddedWebServer server;
    
    private JBCefBrowser browser;
    
    private JButton startButton;
    private JButton stopButton;
    private JButton openInBrowserButton;
    private JLabel statusLabel;

    public YamlDocsToolWindow(Project project) {
        this.project = project;
        this.server = new EmbeddedWebServer(project);
        
        mainPanel = new JPanel(new BorderLayout());
        
        initUI();
    }
    
    private void initUI() {
        // Toolbar with buttons
        Color bgColor = new Color(25, 26, 28);
        mainPanel.setBackground(bgColor);
        JPanel toolbar = new JPanel(new FlowLayout(FlowLayout.LEFT));
        toolbar.setBackground(bgColor);
        
        startButton = new JButton("▶ Start Server");
        stopButton = new JButton("■ Stop");
        openInBrowserButton = new JButton("🌐 Open in Browser");
        statusLabel = new JLabel("● Stopped");
        statusLabel.setForeground(Color.RED);
        
        stopButton.setEnabled(false);
        openInBrowserButton.setEnabled(false);
        
        startButton.addActionListener(e -> startServer());
        stopButton.addActionListener(e -> stopServer());
        openInBrowserButton.addActionListener(e -> openInBrowser());
        
        toolbar.add(startButton);
        toolbar.add(stopButton);
        toolbar.add(openInBrowserButton);
        toolbar.add(statusLabel);
        
        mainPanel.add(toolbar, BorderLayout.NORTH);
        
        // Embedded JCEF browser
        browser = new JBCefBrowser("about:blank");
        browser.getComponent().setBackground(bgColor);
        mainPanel.add(browser.getComponent(), BorderLayout.CENTER);
    }
    
    private void startServer() {
        startButton.setEnabled(false);
        statusLabel.setText("● Starting...");
        statusLabel.setForeground(Color.ORANGE);
        
        SwingWorker<Integer, Void> worker = new SwingWorker<>() {
            @Override
            protected Integer doInBackground() throws Exception {
                return server.start();
            }
            
            @Override
            protected void done() {
                try {
                    int port = get();
                    String url = "http://localhost:" + port;
                    
                    browser.loadURL(url);
                    
                    statusLabel.setText("● Running on port " + port);
                    statusLabel.setForeground(new Color(0, 150, 0));
                    stopButton.setEnabled(true);
                    openInBrowserButton.setEnabled(true);
                } catch (Exception ex) {
                    statusLabel.setText("● Error: " + ex.getMessage());
                    statusLabel.setForeground(Color.RED);
                    startButton.setEnabled(true);
                }
            }
        };
        worker.execute();
    }
    
    private void stopServer() {
        server.stop();
        browser.loadURL("about:blank");
        statusLabel.setText("● Stopped");
        statusLabel.setForeground(Color.RED);
        startButton.setEnabled(true);
        stopButton.setEnabled(false);
        openInBrowserButton.setEnabled(false);
    }
    
    private void openInBrowser() {
        if (server.isRunning()) {
            String url = "http://localhost:" + server.getPort();
            com.intellij.ide.BrowserUtil.browse(url);
        }
    }

    public JPanel getContent() {
        return mainPanel;
    }
}
