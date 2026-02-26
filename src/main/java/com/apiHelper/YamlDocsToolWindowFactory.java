package com.apiHelper;

import com.intellij.openapi.project.Project;
import com.intellij.openapi.wm.ToolWindow;
import com.intellij.openapi.wm.ToolWindowFactory;
import com.intellij.ui.content.Content;
import com.intellij.ui.content.ContentFactory;
import com.intellij.openapi.application.ApplicationManager;
import org.jetbrains.annotations.NotNull;

public class YamlDocsToolWindowFactory implements ToolWindowFactory {

    @Override
    public void createToolWindowContent(@NotNull Project project,
                                        @NotNull ToolWindow toolWindow) {
        YamlDocsToolWindow panel = new YamlDocsToolWindow(project);
        ContentFactory contentFactory =
                ApplicationManager.getApplication().getService(ContentFactory.class);
        Content content = contentFactory.createContent(panel.getContent(), "YAML Docs", false);
        toolWindow.getContentManager().addContent(content);
    }
}